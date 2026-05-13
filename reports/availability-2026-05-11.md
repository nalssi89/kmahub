# KMA API Hub Availability Check

Checked at: 2026-05-11 KST

Authentication: `KMA_API_AUTH_KEY` environment variable

Summary: 19 checked, 19 reachable, 0 failed.

| Endpoint id | Status | Content type |
| --- | ---: | --- |
| `asos_hourly_time` | 200 | `text/plain;charset=EUC-KR` |
| `asos_hourly_range` | 200 | `text/plain;charset=EUC-KR` |
| `asos_daily_date` | 200 | `text/plain;charset=EUC-KR` |
| `asos_daily_range` | 200 | `text/plain;charset=EUC-KR` |
| `asos_element` | 200 | `text/plain;charset=EUC-KR` |
| `surface_normals` | 200 | `text/plain; charset=euc-kr` |
| `year_summary` | 200 | `application/json;charset=UTF-8` |
| `year_summary2` | 200 | `application/json;charset=UTF-8` |
| `avg_ta_anomaly` | 200 | `application/json;charset=UTF-8` |
| `rainfall_anomaly` | 200 | `application/json;charset=UTF-8` |
| `station_phenomenon_data` | 200 | `application/json;charset=UTF-8` |
| `station_phenomenon_data2` | 200 | `application/json;charset=UTF-8` |
| `station_phenomenon_data3` | 200 | `application/json;charset=UTF-8` |
| `monthly_note` | 200 | `application/json;charset=UTF-8` |
| `monthly_station_list` | 200 | `application/json;charset=UTF-8` |
| `monthly_summary` | 200 | `application/json;charset=UTF-8` |
| `monthly_summary2` | 200 | `application/json;charset=UTF-8` |
| `monthly_daily_weather` | 200 | `application/json;charset=UTF-8` |
| `graphic_surface_phenomenon` | 200 | `image/png` |

Notes:

- The Node client uses KMA-compatible TLS by default because Node reported `SELF_SIGNED_CERT_IN_CHAIN` for the API Hub certificate chain while Windows PowerShell reached the same endpoint successfully.
- Set `KMA_API_STRICT_TLS=1` to require Node's default certificate validation.
- Typ01 text responses are decoded with EUC-KR when the response declares that charset.
