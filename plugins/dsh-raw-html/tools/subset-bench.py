import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from fontTools import subset
from fontTools.ttLib import TTFont
import subset_fonts  # 复用 build_charset（GB2312 一级 + 标点 + 数字）

charset = subset_fonts.build_charset()
print('charset size:', len(charset), 'chars')

targets = [
    ('可宋', 'I:/字体/造字工房最全字体-2016-01-06更新/宋体系列/MFKeSong_Noncommercial-Regular.ttf'),
    ('朗宋', 'I:/字体/造字工房最全字体-2016-01-06更新/宋体系列/MFLangSong_Noncommercial-Regular.ttf'),
    ('品宋', 'I:/字体/造字工房最全字体-2016-01-06更新/宋体系列/MFPinSong_Noncommercial-Regular.ttf'),
    ('颜宋', 'I:/字体/造字工房最全字体-2016-01-06更新/宋体系列/MFYanSong_Noncommercial-Regular.ttf'),
    ('静黑超细', 'I:/字体/造字工房最全字体-2016-01-06更新/黑体系列/MFJingHei_Noncommercial-UltLight.ttf'),
    ('秀英v2', 'I:/字体/少女风/汉仪秀英体简-v2.ttf'),
    ('暗恋初夏', 'I:/字体/少女风/暗恋初夏少女.ttf'),
    ('初心少女', 'I:/字体/少女风/初心少女体简.ttf'),
    ('丫丫体', 'I:/字体/少女风/汉仪丫丫体简.ttf'),
]
outdir = 'G:/AI/H3MINI/dsh-raw-html/tools/subset-bench/'
os.makedirs(outdir, exist_ok=True)
total_ttf = 0
total_woff2 = 0
for name, path in targets:
    ttf_size = os.path.getsize(path) / 1024 / 1024
    total_ttf += ttf_size
    try:
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.recalc_bounds = True
        ss = subset.Subsetter(options=opts)
        f = TTFont(path, lazy=False)
        ss.populate(text=charset)
        ss.subset(f)
        out = outdir + name + '.woff2'
        f.save(out)
        size = os.path.getsize(out) / 1024 / 1024
        total_woff2 += size
        print('%-8s TTF %6.2f MB -> woff2 %6.2f MB (%.0f%% 压缩)' % (name, ttf_size, size, (1 - size / ttf_size) * 100))
        f.close()
    except Exception as e:
        print('%-8s TTF %6.2f MB -> ERROR %r' % (name, ttf_size, e))
print('=== 9 款合计: TTF %.1f MB -> woff2 %.2f MB ===' % (total_ttf, total_woff2))
