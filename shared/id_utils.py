import random
import string

ALPHANUM = string.ascii_uppercase + string.digits


def generate_public_id(length: int = 4) -> str:
    return "".join(random.choice(ALPHANUM) for _ in range(length))
