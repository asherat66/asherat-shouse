from fontTools.ttLib import TTFont
from fontTools import subset
import sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

src = 'I:/字体/少女风/汉仪秀英体简.ttf'
out = 'G:/AI/H3MINI/dsh-raw-html/tools/汉仪秀英体简-v2.ttf'

print('=== subset 重建（全量保留字符） ===')
opts = subset.Options()
opts.layout_features = ['*']
opts.glyph_names = True
opts.notdef_outline = True
opts.recalc_bounds = True
opts.recalc_timestamp = True
opts.name_IDs = ['*']
opts.name_languages = ['*']

subsetter = subset.Subsetter(options=opts)
font = TTFont(src, lazy=False)
cmap = font.getBestCmap()
print('cmap chars before:', len(cmap))
subsetter.populate(unicodes=set(cmap.keys()))
subsetter.subset(font)
font.save(out)
print('saved:', out)

f2 = TTFont(out, lazy=True)
for tag in ('glyf', 'hmtx', 'loca', 'cmap'):
    try:
        e = f2.reader.tables[tag]
        print('  %-6s offset=%d length=%d' % (tag, e.offset, e.length))
    except Exception as e:
        print('  %-6s n/a (%r)' % (tag, e))
print('numGlyphs:', f2['maxp'].numGlyphs)
print('cmap chars after:', len(f2.getBestCmap()))
f2.close()
print('=== done ===')
