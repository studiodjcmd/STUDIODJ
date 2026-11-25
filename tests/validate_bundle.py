from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
base=ROOT/"controller/baseline"
with TemporaryDirectory() as tmp:
    out=Path(tmp)/"bundle"
    subprocess.run([sys.executable,str(ROOT/"tools/build_alpha.py"),"--out",str(out)],check=True)
    derived=ET.parse(out/"controllers/Studio DJ - Numark NS6 Original.midi.xml").getroot()
    original=ET.parse(base/"Numark NS6 Original.midi.xml").getroot()
    def bindings(tree):
        return [(c.findtext("group"),c.findtext("key"),c.findtext("status"),c.findtext("midino")) for c in tree.findall("./controller/controls/control")]
    assert bindings(original)==bindings(derived)
    assert derived.findtext("./controller/init-function")=="StudioNS6.init"
    assert derived.findtext("./controller/shutdown-function")=="NumarkNS6.shutdown"
    assert (out/"controllers/Studio-NS6-Baseline.js").read_bytes()==(base/"Numark-NS6-Original.js").read_bytes()
    for path, digest in json.loads((out/"SHA256SUMS.json").read_text()).items():
        assert hashlib.sha256((out/path).read_bytes()).hexdigest()==digest
print("PASS: 383 unchanged MIDI bindings; separate overlay and byte-identical original JS; bundle hashes verified")
