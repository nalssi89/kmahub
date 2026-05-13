# kmahub-mcp

MCP server for the KMA API Hub surface-observation endpoints listed in the ASOS/ground-observation documentation.

## Setup

```powershell
$env:KMA_API_AUTH_KEY = "your-issued-key"
npm.cmd install
```

## Run

```powershell
npm.cmd start
```

## MCP tools

- `kma_list_endpoints`: lists all supported endpoint ids, parameters, and default test parameters.
- `kma_call_endpoint`: calls one endpoint by id.
- `kma_test_endpoints`: checks availability for all or selected endpoints.
- `kma_get_south_korea_normal_criteria`: returns official 1991-2020 South Korea 62-station monthly normals and similar ranges.
- `kma_compute_south_korea_normal_criteria`: recomputes a normal and similar range from yearly monthly values.
- `kma_classify_south_korea_monthly_value`: returns `-`, `0`, or `+` for a monthly temperature departure or precipitation amount.
- `kma_validate_south_korea_normal_criteria`: checks that the built-in official monthly criteria table is complete.

## Local availability check

```powershell
$env:KMA_API_AUTH_KEY = "your-issued-key"
npm.cmd run test:api
```

## South Korea 62-station normal ranges

The built-in normal-range criteria follow the official 1991-2020 South Korea mainland 62-station monthly table:

- Mean, maximum, and minimum temperature: normal value plus or minus `0.43 * sample standard deviation`.
- Precipitation: 33-67 percentile similar range from yearly monthly accumulated precipitation.
- Classification uses the official published monthly criteria values for exact agreement.
- Official normal-station policy uses merged Daegu/Sinam station `860` and Jeonju/Wansan station `864` for 1991-2020 normal calculations.

Check the normal-range tools without an API key:

```powershell
npm.cmd run test:normal
```

The server never stores the API key in source files. Responses redact `authKey` in returned URLs.

By default the client uses a KMA-compatible TLS mode because Node may reject the API Hub certificate chain with
`SELF_SIGNED_CERT_IN_CHAIN` while Windows' HTTP client accepts it. Set `KMA_API_STRICT_TLS=1` to require Node's
default certificate validation.
