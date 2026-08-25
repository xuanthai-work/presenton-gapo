from api.v1.auth.config import (
    LEGACY_SESSION_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    read_session_token,
)


def test_session_cookie_names():
    assert SESSION_COOKIE_NAME == "gslide_session"
    assert LEGACY_SESSION_COOKIE_NAME == "presenton_session"


def test_read_session_token_prefers_gslide_cookie():
    assert (
        read_session_token(
            {
                "gslide_session": "new-jwt",
                "presenton_session": "old-jwt",
            }
        )
        == "new-jwt"
    )


def test_read_session_token_falls_back_to_legacy():
    assert read_session_token({"presenton_session": "old-jwt"}) == "old-jwt"


def test_read_session_token_ignores_empty_new_cookie():
    assert (
        read_session_token({"gslide_session": "", "presenton_session": "old-jwt"})
        == "old-jwt"
    )