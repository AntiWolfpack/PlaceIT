# PlaceIT Food Marketplace

## Local setup on Windows

Open this inner `PlaceIT-Food-Marketplace` folder in VS Code; it contains the workspace manifest and the `artifacts` and `lib` packages. The outer Downloads folder is only a wrapper.

Install dependencies from this folder:

```powershell
pnpm install
```

Create a free PostgreSQL database with [Neon](https://neon.tech/) or [Supabase](https://supabase.com/), or install PostgreSQL locally. Edit `.env` and replace the `DATABASE_URL` placeholder with the database provider's connection string. Use the connection string exactly as provided, with no surrounding quotes or spaces; Neon and Supabase connections commonly require `?sslmode=require`. Keep `.env` private; it is git-ignored.

Set `DATABASE_URL` in the current PowerShell session before applying the schema:

```powershell
$databaseLine = Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$env:DATABASE_URL = ($databaseLine -replace '^DATABASE_URL=', '').Trim('"')
pnpm --filter @workspace/db push
```

The repository includes a sample-data seed script. Run it from the same PowerShell terminal after the schema push if you want sample vendors and menus:

```powershell
pnpm --filter @workspace/scripts seed-placeit
```

The seed script is safe to rerun for its existing sample IDs; it leaves already-present records unchanged. A new, unseeded database is valid and the vendor endpoint will return an empty JSON array until vendors are added.

Start the API and frontend in separate terminals, both from this inner project folder. The API loads `DATABASE_URL` from `.env`; set its port explicitly if needed:

```powershell
$env:PORT = "3000"
pnpm --filter @workspace/api-server dev
```

```powershell
$env:PORT = "5173"
$env:BASE_PATH = "/"
pnpm --filter @workspace/placeit dev
```

Vite uses the explicitly set `PORT` for the frontend; otherwise it uses `VITE_PORT` from `.env` or defaults to `5173`. The API defaults to port `3000`. Vite proxies `/api` requests to `http://localhost:3000`; `API_PROXY_TARGET` in `.env` can override that target.

```powershell
Invoke-RestMethod http://localhost:3000/api/healthz
Invoke-RestMethod http://localhost:3000/api/vendors
```

The health endpoint should return `{"status":"ok"}` and the vendors endpoint a JSON array. It will be empty before seeding; run the seed command above to populate sample vendors and menus. Then reload the frontend at `http://localhost:5173`.

## PayFast card payments

The app sends customers to PayFast's hosted checkout; PlaceIT does not collect or store card numbers. Customers choose card on PayFast, complete any bank verification requested (such as approval in their banking app or an OTP), and return to their receipt. The receipt polls for the PayFast ITN (Instant Transaction Notification), and only the server-validated notification can mark an order paid.

For sandbox testing, copy the PayFast settings from `.env.example` into your ignored `.env` and fill them with sandbox credentials. Set `PAYFAST_RETURN_URL` and `PAYFAST_CANCEL_URL` to the frontend's `/orders` URL. PayFast appends the order ID; the app opens the matching receipt and identifies a cancelled checkout. The `PAYFAST_NOTIFY_URL` must be a public HTTPS URL pointing to `/api/payfast/notify`; a PayFast server cannot call a `localhost` address. Use a secure HTTPS tunnel for local sandbox testing or deploy the API to a reachable host.

Payment links are only available when all PayFast server settings are configured and the selected vendor has a PayFast split-payment merchant ID in `vendors.payfast_merchant_id`. The sample vendors intentionally have no merchant IDs, so their receipts will show that payment setup is unavailable until each vendor is onboarded for PayFast split payments. Test with sandbox credentials and an onboarded sandbox vendor before switching `PAYFAST_MODE` to `live`. Never commit `.env` or use live credentials for test transactions.

## Vendor orders and customer receipts

After PayFast's validated `COMPLETE` notification, the API assigns a unique public order number, creates a four-digit collection code, emails the receipt through Resend, and sends the kitchen a WhatsApp template alert. Vendors sign in at `http://localhost:5173/vendor/orders`; the dashboard refreshes every 15 seconds and supports order-number search, accepting/preparing/ready updates, and pickup-code verification. A code is locked after five incorrect attempts. Customers see their order number and pickup code on the receipt and get status emails. The WhatsApp alert contains the order number, the customer's first name, item summary, and total; it does not include the pickup code.

To enable the vendor dashboard:

1. Create a Supabase Auth user for each vendor and configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in the ignored `.env`. The API verifies the bearer token with Supabase and maps its user ID to exactly one row in `vendors.supabase_user_id`; never expose a service-role key to the frontend.
2. Link the Supabase user and enter the vendor's WhatsApp-enabled number in that vendor row. For example, using the vendor row ID and auth user's UUID from your own database/admin console:

   ```sql
   UPDATE vendors
   SET supabase_user_id = '<supabase-auth-user-uuid>',
       whatsapp_phone = '<international-number-with-country-code>'
   WHERE id = '<vendor-row-uuid>';
   ```

3. Set a long random `PICKUP_CODE_SECRET` once and keep it stable. It protects the stored pickup-code hash and the encrypted code returned only on the customer's private receipt.
4. Configure Resend with `RESEND_API_KEY` and a verified sender in `RESEND_FROM_EMAIL`.
5. Configure the WhatsApp Business Cloud API values in `.env`. Create and approve the `WHATSAPP_ORDER_TEMPLATE` with four body placeholders in this order: order number, customer first name, items, total. Set `WHATSAPP_ORDER_TEMPLATE_LANGUAGE` to that approved template's language code. Meta requires an approved template for these business-initiated alerts.
6. Apply the additive database schema changes with `pnpm --filter @workspace/db push`, then restart the API and frontend.

Orders are not sent to a vendor dashboard or WhatsApp until PayFast confirms payment. Failed provider sends are logged by the API and do not reverse a verified payment. Configure and test both providers in their sandbox/test environments before taking live orders.

## Postman

Import [`lib/api-spec/openapi.yaml`](./lib/api-spec/openapi.yaml) into Postman to generate a collection from the maintained OpenAPI contract. See [`postman/README.md`](./postman/README.md).
