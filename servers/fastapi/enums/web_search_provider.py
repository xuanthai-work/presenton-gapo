from enum import Enum


class WebSearchProvider(Enum):
    AUTO = "auto"
    NATIVE = "native"
    TAVILY = "tavily"
    EXA = "exa"
    BRAVE = "brave"