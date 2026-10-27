"""Turn exceptions into consistent JSON error responses.

Every error looks like:  {"error": {"code": "...", "message": "...", "details": ...}}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core import InvalidBlockError, InvalidTransactionError
from app.services.errors import BadRequestError, ConflictError, NotFoundError

logger = logging.getLogger(__name__)

# exception type -> (HTTP status, error code)
_DOMAIN_ERRORS: dict[type[Exception], tuple[int, str]] = {
    InvalidTransactionError: (status.HTTP_400_BAD_REQUEST, "invalid_transaction"),
    InvalidBlockError: (status.HTTP_400_BAD_REQUEST, "invalid_block"),
    NotFoundError: (status.HTTP_404_NOT_FOUND, "not_found"),
    ConflictError: (status.HTTP_409_CONFLICT, "conflict"),
    BadRequestError: (status.HTTP_400_BAD_REQUEST, "bad_request"),
}


def error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content={"error": body})


def register_exception_handlers(app: FastAPI) -> None:
    for exc_type, (status_code, code) in _DOMAIN_ERRORS.items():

        async def handler(_: Request, exc: Exception, status_code=status_code, code=code):
            return error_response(status_code, code, str(exc))

        app.add_exception_handler(exc_type, handler)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}
        where = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
        message = f"{where}: {first.get('msg')}" if where else str(first.get("msg", "invalid"))
        # Drop the raw "ctx" objects (e.g. the ValueError instance) - not JSON-friendly.
        details = [{k: v for k, v in err.items() if k != "ctx"} for err in errors]
        return error_response(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "validation_error",
            message,
            jsonable_encoder(details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "internal_error", "internal server error"
        )
