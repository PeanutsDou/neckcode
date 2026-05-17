import zipfile, xml.etree.ElementTree as ET
import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'D:\窦中君\实习\产出\TA_260403_测试_米哈游原神测试\米哈游2026校招-Varsapura-特效TA笔试\Varsapura-特效TA笔试.docx'
with zipfile.ZipFile(path, 'r') as z:
    xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    texts = []
    for t in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
        if t.text:
            texts.append(t.text)
    print('\n'.join(texts))
