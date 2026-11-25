from pathlib import Path
import hashlib, json
import xml.etree.ElementTree as ET
from collections import Counter
base = Path(__file__).resolve().parents[1] / 'controller' / 'baseline'
for name, expected in json.loads((base / 'sha256.json').read_text()).items():
    assert hashlib.sha256((base / name).read_bytes()).hexdigest() == expected, name
r = ET.parse(base / 'Numark NS6 Original.midi.xml').getroot()
assert r.tag == 'MixxxControllerPreset'
controls = r.findall('./controller/controls/control')
assert len(controls) == 383
pairs = Counter((int(c.findtext('status'), 0), int(c.findtext('midino'), 0)) for c in controls)
assert all(n == 1 for n in pairs.values())
assert all(0x80 <= s <= 0xEF and 0 <= k <= 127 for s,k in pairs)
assert r.findtext('./controller/init-function') == 'NumarkNS6.init'
assert r.findtext('./controller/shutdown-function') == 'NumarkNS6.shutdown'
assert any(x.get('filename') == 'Numark-NS6-Original.js' for x in r.findall('./controller/scriptfiles/file'))
print('PASS: baseline SHA-256, 383 unique MIDI bindings')
