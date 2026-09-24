from dataclasses import dataclass, field
from typing import Optional


@dataclass
class User:
    name: str
    email: str
    age: int = 0
    tags: list = field(default_factory=list)


@dataclass
class Admin(User):
    level: int = 1


def get_user(user_id: int) -> User:
    return User(name="a", email="b")


def get_name(user_id: int) -> Optional[str]:
    return None
