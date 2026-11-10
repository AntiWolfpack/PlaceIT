# Postman

Import the API contract directly into Postman:

1. Open **Import** in Postman.
2. Choose **File** and select [`../lib/api-spec/openapi.yaml`](../lib/api-spec/openapi.yaml).
3. Import it as an OpenAPI definition and generate a collection.
4. Set the collection's base URL to `http://localhost:3000` (or the host and port where the API server is running).

The OpenAPI document is the source of truth for the existing API routes. It includes health, vendor search/details, order creation, and receipt lookup. Order creation writes to PostgreSQL; use a disposable/test database for that request.
