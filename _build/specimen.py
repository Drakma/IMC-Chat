import sys, os
from PIL import Image, ImageDraw, ImageFont
D = os.path.join(os.path.dirname(__file__), '..', 'server', 'public', 'fonts')
out = sys.argv[1]
rows = []
for fam in ('imc-sans', 'imc-serif', 'imc-dyslexia'):
    for w, it in ((400, ''), (700, ''), (300, '-italic'), (900, '')):
        rows.append(os.path.join(D, '%s-%d%s.ttf' % (fam, w, it)))
img = Image.new('RGB', (1500, 12 * 118 + 20), '#222A2A'); dr = ImageDraw.Draw(img)
for i, f in enumerate(rows):
    ft = ImageFont.truetype(f, 46)
    dr.text((20, 10 + i * 118), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', font=ft, fill='#E2DAC2')
    dr.text((20, 62 + i * 118), 'abcdefghijklmnopqrstuvwxyz bdpq !?&@%$ éñü', font=ft, fill='#4FBBBC')
img.save(out)
