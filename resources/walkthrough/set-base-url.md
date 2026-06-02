The MiMo API has separate endpoints for each subscription plan. **You must select the one that matches your plan** — using the wrong endpoint will cause request errors.

If you are using the standard pay-as-you-go API, keep the default `api.xiaomimimo.com/v1` endpoint. Do not choose a Token Plan endpoint based only on your physical region.

**Available endpoints:**

| Endpoint | Plan |
|---|---|
| `api.xiaomimimo.com/v1` | Standard API (no plan, default) |
| `token-plan-cn.xiaomimimo.com/v1` | Token Plan — China |
| `token-plan-sgp.xiaomimimo.com/v1` | Token Plan — Singapore |
| `token-plan-ams.xiaomimimo.com/v1` | Token Plan — Europe (Amsterdam) |

To change the base URL:

- Open **Settings** (`Ctrl + ,`)
- Search for `mimo-copilot.baseUrl`
- Select the endpoint that matches your plan
