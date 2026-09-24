import { describe, expect, it } from "vitest";
import { extractPythonSymbols } from "../../src/python/symbols.js";

const MODELS = `from dataclasses import dataclass
from typing import TypedDict, Optional
from pydantic import BaseModel


@dataclass
class User:
    name: str
    email: str
    age: int = 0


class Profile(TypedDict):
    bio: str


class Account(BaseModel):
    id: int


class Plain:
    title = "x"
    count: int


class Outer:
    class Inner:
        deep: str


def get_user() -> User:
    return User(name="a", email="b")


def multi(
    a: int,
    b: str,
) -> Optional[Profile]:
    return None


def helper(self, x):
    temp: int = 1
    return x
`;

describe("python symbols", () => {
  it("extracts dataclass attributes", () => {
    const { classes } = extractPythonSymbols(MODELS);
    const user = classes.get("User");
    expect(user?.kind).toBe("dataclass");
    expect(user?.attrs.get("name")).toBe("str");
    expect(user?.attrs.get("email")).toBe("str");
    expect(user?.attrs.get("age")).toBe("int");
  });

  it("classifies TypedDict, Pydantic, and plain classes", () => {
    const { classes } = extractPythonSymbols(MODELS);
    expect(classes.get("Profile")?.kind).toBe("typeddict");
    expect(classes.get("Profile")?.attrs.get("bio")).toBe("str");
    expect(classes.get("Account")?.kind).toBe("pydantic");
    const plain = classes.get("Plain");
    expect(plain?.kind).toBe("class");
    expect(plain?.attrs.get("title")).toBe("unknown");
    expect(plain?.attrs.get("count")).toBe("int");
  });

  it("skips nested classes, methods, and locals", () => {
    const { classes, functions } = extractPythonSymbols(MODELS);
    expect(classes.has("Inner")).toBe(false);
    expect(classes.has("Outer")).toBe(true);
    expect(functions.has("helper")).toBe(true);
    // Method bodies and function locals never leak into class attrs.
    expect(classes.get("Plain")?.attrs.has("temp")).toBe(false);
  });

  it("extracts return annotations including multiline defs", () => {
    const { functions } = extractPythonSymbols(MODELS);
    expect(functions.get("get_user")?.returns).toBe("User");
    expect(functions.get("multi")?.returns).toBe("Optional[Profile]");
    expect(functions.get("helper")?.returns).toBeNull();
  });

  it("never throws on hostile input", () => {
    for (const text of ["class", "class A(", "def f(", "@dataclass", '"""doc', "x: "]) {
      expect(() => extractPythonSymbols(text)).not.toThrow();
    }
    expect(extractPythonSymbols("").classes.size).toBe(0);
  });
});
