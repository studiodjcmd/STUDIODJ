"""Static structure, not a runtime test."""
from pathlib import Path
import xml.etree.ElementTree as ET
skin = Path(__file__).resolve().parents[1] / 'skin' / 'StudioDJ'
root = ET.parse(skin / 'skin.xml').getroot()
assert root.findtext('manifest/title') == 'Studio DJ'
for tag in ('Visual','Overview','NumberBpm','NumberPos','NumberRate','Key'):
    assert sorted(int(x.findtext('Channel')) for x in root.iter(tag)) == [1,2,3,4], tag
attrs = {x.get('config_key'): x.text for x in root.findall('./manifest/attributes/attribute')}
assert attrs['[App],num_decks'] == '4'
assert attrs['[Skin],show_4decks'] == '0'
assert len(list(root.iter('Library'))) == len(list(root.iter('SearchBox'))) == 1
for x in root.iter('Connection'):
    key = x.findtext('ConfigKey')
    if key.startswith(('[Skin]','[NS6Surface]')):
        assert key in attrs, key
for stack in root.iter('WidgetStack'):
    assert stack.get('currentpage') in attrs
    assert len(stack.findall('Children/*')) == 2
defs = {x.findtext('ObjectName'): x for x in root.iter('SingletonDefinition')}
assert set(defs) == {'Deck1','Deck2','Deck3','Deck4'}
for n in range(1,5):
    assert sum(x.findtext('ObjectName') == f'Deck{n}' for x in root.iter('SingletonContainer')) == 2
for x in list(root.iter('PathVu')) + list(root.iter('PathBack')):
    assert (skin / x.text.removeprefix('skin:')).is_file()
assert (skin / 'style.qss').is_file()
assert len([x for x in root.iter('WidgetGroup') if x.findtext('ObjectName') == 'MiniDeck']) == 4
assert len([x for x in root.iter('Label') if x.findtext('ObjectName') == 'CueSlot']) == 32
assert len([x for x in root.iter('WidgetStack') if x.get('currentpage') == '[Skin],show_maximized_library']) == 1
print('PASS: four native deck singletons, four permanent rail summaries, active pair / four / Browse stacks, 32 cue indicators, assets')
