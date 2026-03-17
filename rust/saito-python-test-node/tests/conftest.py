from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
PYTHON_SDK_SRC = ROOT.parents[0] / "saito-python" / "src"

for entry in (SRC, PYTHON_SDK_SRC):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))
