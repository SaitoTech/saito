"""Rebuild the original pixel font. Requires Python fonttools and brotli.
Run from node/: python mods/robots/docs/build/font.py
Glyph designs and SVG lettering share lib/art.js as their source.
"""
import base64
import io
import json
import subprocess
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

root = Path(__file__).resolve().parents[2]
glyphs = json.loads(subprocess.check_output(['node', '-e',
    'process.stdout.write(JSON.stringify(require(process.argv[1]).glyphs))', str(root / 'lib/art.js')]))
font = FontBuilder(1000, isTTF=True)
order = ['.notdef', 'space'] + [f'pixel{ord(c)}' for c in glyphs]
font.setupGlyphOrder(order)
cmap = {32: 'space'}
for char in glyphs:
    cmap[ord(char)] = f'pixel{ord(char)}'
    if char.isalpha():
        cmap[ord(char.lower())] = f'pixel{ord(char)}'
font.setupCharacterMap(cmap)
outlines = {}
for name in order:
    pen = TTGlyphPen(None)
    rows = glyphs.get(chr(int(name[5:])), []) if name.startswith('pixel') else []
    # Remove shared pixel edges so neighboring squares form solid contours.
    # Separate touching outlines otherwise show antialiasing seams in browsers.
    edges = set()
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            if cell != '1':
                continue
            left, bottom = x * 100, (6-y)*100
            points = [(left,bottom), (left,bottom+100),
                      (left+100,bottom+100), (left+100,bottom)]
            for a,b in zip(points, points[1:]+points[:1]):
                if (b,a) in edges:
                    edges.remove((b,a))
                else:
                    edges.add((a,b))
    directions = {(1,0):0, (0,1):1, (-1,0):2, (0,-1):3}
    while edges:
        start, current = min(edges)
        edges.remove((start,current))
        pen.moveTo(start)
        previous = start
        while current != start:
            pen.lineTo(current)
            candidates = [b for a,b in edges if a == current]
            direction = directions[((current[0]-previous[0])//100,
                                    (current[1]-previous[1])//100)]
            def turn(b):
                next_direction = directions[((b[0]-current[0])//100,
                                             (b[1]-current[1])//100)]
                return {3:0, 0:1, 1:2, 2:3}[(next_direction-direction)%4]
            following = min(candidates, key=turn)
            edges.remove((current,following))
            previous,current = current,following
        pen.closePath()
    outlines[name] = pen.glyph()
font.setupGlyf(outlines)
font.setupHorizontalMetrics({name: (600, 0) for name in order})
font.setupHorizontalHeader(ascent=850, descent=-150)
font.setupNameTable({'familyName':'RobotsPixel','styleName':'Regular','uniqueFontIdentifier':'RobotsPixel 1.0',
                    'fullName':'RobotsPixel','psName':'RobotsPixel','version':'Version 1.0'})
font.setupOS2(sTypoAscender=850, sTypoDescender=-150, usWinAscent=850, usWinDescent=150)
font.setupPost()
font.font.flavor = 'woff2'
output = io.BytesIO()
font.save(output)
(root / 'lib/pixel-font.js').write_text('// Generated from the original 5x7 glyphs in art.js by docs/build/font.py.\nmodule.exports = "' + base64.b64encode(output.getvalue()).decode() + '";\n')
