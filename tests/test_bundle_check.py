"""build_data_bundle.py 가 실제로 만드는 번들이 Vercel 빌드 검사(check_data_bundle.js)를 통과하는지"""
import os
import shutil
import subprocess

import pytest

import build_data_bundle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.mark.skipif(not shutil.which("node"), reason="node 없음")
def test_builder_output_passes_check(tmp_path, monkeypatch):
    out = tmp_path / "cnh_data_bundle.js"
    monkeypatch.setattr(build_data_bundle, "OUTPUT_BUNDLE_PATH", str(out))
    build_data_bundle.build_bundle()
    r = subprocess.run(["node", os.path.join(ROOT, "check_data_bundle.js"), str(out)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    out.write_text(out.read_text(encoding="utf-8") + "alert(1)\n", encoding="utf-8")
    r = subprocess.run(["node", os.path.join(ROOT, "check_data_bundle.js"), str(out)], capture_output=True, text=True)
    assert r.returncode != 0
