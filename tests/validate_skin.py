"""Static checks only. Load in Mixxx before claiming runtime compatibility."""
from pathlib import Path
import xml.etree.ElementTree as ET
skin = Path(__file__).resolve().parents[1] / 'skin' / 'StudioDJ'
root = ET.parse(skin / 'skin.xml').getroot()
assert root.tag == 'skin'
assert root.findtext('manifest/title') == 'Studio DJ'
for tag in ('Visual', 'Overview', 'NumberBpm', 'NumberPos', 'NumberRate'):
    assert sorted(int(x.findtext('Channel')) for x in root.iter(tag)) == [1,2,3,4], tag
attrs = {x.get('config_key'): x.text for x in root.findall('./manifest/attributes/attribute')}
for key in ('[Skin],show_4decks','[Skin],show_maximized_library','[Skin],show_effectrack','[NS6Surface],installed','[NS6Surface],left_alt','[NS6Surface],right_alt'):
    assert key in attrs, key
assert attrs['[App],num_decks'] == '4'
assert len(list(root.iter('Library'))) == 1
assert len(list(root.iter('SearchBox'))) == 1
assert (skin / 'style.qss').is_file()
for connection in root.iter('Connection'):
    key = connection.findtext('ConfigKey')
    if key.startswith(('[Skin]','[NS6Surface]')):
        assert key in attrs, key
print('PASS: skin structure, four decks, native waveforms and library')
