from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Check that the API is running")
def health() -> dict[str, str]:
    return {"status": "ok"}
