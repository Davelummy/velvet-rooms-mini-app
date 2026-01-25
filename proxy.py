import logging
import os
from pathlib import Path

from aiohttp import ClientSession, web
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(dotenv_path=ROOT / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("proxy")

USER_BOT_PORT = int(os.getenv("USER_BOT_PORT", os.getenv("WEBHOOK_PORT", "8080")))
ADMIN_BOT_PORT = int(os.getenv("ADMIN_BOT_PORT", str(USER_BOT_PORT + 1)))
WEBAPP_PORT = int(os.getenv("WEBAPP_PORT", "3000"))
PROXY_HOST = os.getenv("PROXY_HOST", "0.0.0.0")
PROXY_PORT = int(os.getenv("PROXY_PORT", "8082"))
PROXY_MAX_MB = int(os.getenv("PROXY_MAX_MB", "200"))

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


async def _forward(request: web.Request, upstream_url: str) -> web.Response:
    body = await request.read()
    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP_HEADERS
    }
    session: ClientSession = request.app["session"]
    async with session.request(request.method, upstream_url, data=body, headers=headers) as resp:
        resp_body = await resp.read()
        response_headers = {
            k: v for k, v in resp.headers.items() if k.lower() not in HOP_BY_HOP_HEADERS
        }
        response_headers.pop("Content-Length", None)
        return web.Response(status=resp.status, body=resp_body, headers=response_headers)


async def handle_user_webhook(request: web.Request) -> web.Response:
    upstream_url = f"http://127.0.0.1:{USER_BOT_PORT}/webhook"
    return await _forward(request, upstream_url)


async def handle_admin_webhook(request: web.Request) -> web.Response:
    upstream_url = f"http://127.0.0.1:{ADMIN_BOT_PORT}/admin_webhook"
    return await _forward(request, upstream_url)


async def handle_webapp(request: web.Request) -> web.Response:
    path = request.rel_url.path
    upstream_url = f"http://127.0.0.1:{WEBAPP_PORT}{path}"
    if request.rel_url.query_string:
        upstream_url = f"{upstream_url}?{request.rel_url.query_string}"
    return await _forward(request, upstream_url)


async def on_startup(app: web.Application) -> None:
    app["session"] = ClientSession(auto_decompress=False)
    logger.info("Proxy listening on %s:%s", PROXY_HOST, PROXY_PORT)
    logger.info("User webhook upstream: http://127.0.0.1:%s/webhook", USER_BOT_PORT)
    logger.info("Admin webhook upstream: http://127.0.0.1:%s/admin_webhook", ADMIN_BOT_PORT)
    logger.info("Web app upstream: http://127.0.0.1:%s", WEBAPP_PORT)


async def on_cleanup(app: web.Application) -> None:
    await app["session"].close()


def main() -> None:
    app = web.Application(client_max_size=PROXY_MAX_MB * 1024**2)
    app.router.add_route("POST", "/webhook", handle_user_webhook)
    app.router.add_route("POST", "/admin_webhook", handle_admin_webhook)
    app.router.add_route("*", "/{tail:.*}", handle_webapp)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    web.run_app(app, host=PROXY_HOST, port=PROXY_PORT)


if __name__ == "__main__":
    main()
