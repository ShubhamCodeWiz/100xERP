"""100x ERP entry point: only wires the application together.

Run:  uvicorn app:app --reload
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config import STATIC_DIR
from documents import router as documents_router
from login import router as login_router
from panel import router as panel_router
from performance import router as performance_router

app = FastAPI(title="100x ERP")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.include_router(login_router)
app.include_router(panel_router)
app.include_router(performance_router)
app.include_router(documents_router)


def _validation_message(exc: RequestValidationError) -> str:
    lines = []
    for error in exc.errors():
        path = [str(p) for p in error.get("loc", ()) if p not in ("body", "query", "path")]
        field = ".".join(path).replace("_", " ")
        message = str(error.get("msg", "Invalid value"))
        if message.startswith("Value error, "):
            message = message[len("Value error, "):]
        lines.append(f"{field.capitalize()}: {message}" if field else message)
    return "\n".join(lines) or "The submitted data is not valid."


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": _validation_message(exc)})


@app.exception_handler(Exception)
async def unexpected_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500, content={"detail": "Unexpected server error. Please try again."}
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    elif request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

