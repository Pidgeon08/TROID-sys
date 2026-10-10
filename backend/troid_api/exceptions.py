from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """DRF's handler, but `{"detail": "..."}` becomes `{"error": "..."}` to
    match the error shape the rest of this API (and the frontend) uses."""
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict) and set(response.data) == {'detail'}:
        response.data = {'error': response.data['detail']}
    return response
