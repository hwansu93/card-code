from cardcode.card_reconciler import match_session_to_card


def test_match_by_tmux_session_name():
    cards = [
        {"id": "1", "tmux_session": "cc-myapp-abc", "project_path": "/p/a", "manual_overrides": "{}"},
        {"id": "2", "tmux_session": None, "project_path": "/p/b", "manual_overrides": "{}"},
    ]
    match = match_session_to_card({"name": "cc-myapp-abc"}, cards)
    assert match is not None
    assert match["id"] == "1"


def test_no_match_returns_none():
    cards = [{"id": "1", "tmux_session": "cc-other-xyz", "project_path": "/p/other", "manual_overrides": "{}"}]
    match = match_session_to_card({"name": "cc-newproject-abc"}, cards)
    assert match is None


def test_match_skips_launching_cards():
    cards = [{"id": "1", "tmux_session": "cc-myapp-abc", "project_path": "/p/a", "manual_overrides": "{}", "is_launching": 1}]
    match = match_session_to_card({"name": "cc-myapp-abc"}, cards, skip_launching=True)
    assert match is None


def test_match_includes_launching_when_disabled():
    cards = [{"id": "1", "tmux_session": "cc-myapp-abc", "project_path": "/p/a", "manual_overrides": "{}", "is_launching": 1}]
    match = match_session_to_card({"name": "cc-myapp-abc"}, cards, skip_launching=False)
    assert match is not None
