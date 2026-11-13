"""AWS Lambda entry point. Lambda calls 'handler'; Mangum turns the Function URL request into an ASGI request."""
from mangum import Mangum

from app.main import create_app

handler = Mangum(create_app())
