"""Template engine setup with universal template rendering helper."""
from fastapi import Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from config import BUILD, TEMPLATES_DIR


def asset_url(path: str) -> str:
    """Generate static asset URL with cache-busting query parameter."""
    path = path.lstrip("/")
    return f"/static/{path}?v={BUILD}"


templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Register globals required by base.html and login.html
templates.env.globals["asset"] = asset_url
templates.env.globals["build"] = BUILD
templates.env.globals["BUILD"] = BUILD


def render_template(template_name: str, request: Request, context: dict | None = None) -> HTMLResponse:
    """Universal renderer compatible with both new and legacy Starlette TemplateResponse signatures."""
    ctx = {"request": request}
    if context:
        ctx.update(context)

    try:
        # Modern Starlette signature (request as first positional argument)
        return templates.TemplateResponse(request, template_name, ctx)
    except TypeError:
        # Legacy Starlette signature (template name first, context dict second)
        return templates.TemplateResponse(template_name, ctx)

