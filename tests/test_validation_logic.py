from scripts.validate_sports_snapshot import has_decisive_binary_resolution


def test_decisive_resolution_excludes_void_contingent_games():
    assert has_decisive_binary_resolution({"outcomePrices": '["1", "0"]'})
    assert has_decisive_binary_resolution({"outcomePrices": [0, 1]})
    assert not has_decisive_binary_resolution({"outcomePrices": '["0.5", "0.5"]'})
    assert not has_decisive_binary_resolution({"outcomePrices": []})
