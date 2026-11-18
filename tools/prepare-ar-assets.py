"""Extract (without redrawing) AR assets from the two supplied reference images."""
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

root = Path(__file__).resolve().parents[1] / 'assets' / 'ar'
sheet, photo, alternate = (Image.open(file).convert('RGB') for file in sys.argv[1:4])
assert sheet.size == (1147, 1080) and photo.size == (2275, 1280)
(root / 'characters').mkdir(parents=True, exist_ok=True)
(root / 'targets').mkdir(exist_ok=True)

# Coordinates refer to the uncropped reference images. Masks cover print only.
# Each entry specifies the selected shoe (or drum stand) in both sources.
placements = [
    ('blue', '举鱼', (80,25,430,490), (296,471), (229,692,431,977), (287,956),
     [(254,776),(281,750),(290,729),(347,707),(367,719),(406,762),(420,928),(414,955),(347,972),(260,969),(245,928),(244,821)]),
    ('yellow', '吹唢呐', (442,513,732,1020), (496,992), (635,538,805,797), (678,785),
     [(750,552),(779,546),(785,562),(767,582),(798,611),(795,644),(763,682),(755,705),(800,768),(793,790),(654,792),(646,764),(662,712),(691,663),(674,624),(674,596),(731,579)]),
    ('pink', '横持鱼', (430,55,739,505), (519,485), (983,721,1188,992), (1124,974),
     [(1058,745),(1086,730),(1127,742),(1147,771),(1148,819),(1177,850),(1174,873),(1140,875),(1166,954),(1159,978),(1022,992),(999,965),(998,895),(1027,850),(1037,803),(1045,781)]),
    ('navy', '打钹', (95,514,401,1009), (291,977), (1335,472,1507,741), (1443,728),
     [(1358,478),(1415,491),(1449,511),(1450,528),(1468,549),(1466,591),(1492,640),(1496,725),(1464,738),(1391,737),(1398,696),(1351,682),(1343,648),(1350,614),(1380,577),(1362,549),(1363,520),(1383,502)]),
    ('clear', '打鼓', (740,250,1040,770), (858,744), (1727,692,1901,957), (1833,941),
     [(1740,723),(1774,702),(1810,696),(1837,720),(1842,737),(1864,771),(1882,815),(1878,847),(1896,882),(1895,947),(1740,948),(1739,848),(1748,819),(1737,785)]),
]

white_caps = {
    'blue': (258,165,300,205), 'pink': (573,155,621,191),
    'navy': (258,636,310,680), 'clear': (824,327,883,367),
}
alternate_placements = {
    'blue': ((50,1062,170,1236),(132,1225),
             [(111,1063),(152,1081),(159,1101),(134,1106),(152,1120),(167,1119),(168,1157),(148,1175),(156,1220),(135,1233),(61,1228),(54,1204),(78,1180),(76,1139),(87,1105)]),
    'yellow': ((264,708,354,865),(282,853),
               [(312,712),(337,720),(325,739),(343,746),(338,777),(323,800),(349,848),(342,861),(273,862),(267,843),(273,808),(283,778),(272,753),(285,740),(307,735)]),
    'pink': ((987,586,1099,735),(1011,718),
             [(1016,589),(1058,584),(1061,599),(1087,627),(1080,645),(1095,706),(1073,730),(1024,733),(990,718),(995,696),(1015,663),(990,651),(990,638),(1022,628),(1012,610)]),
    'navy': ((650,633,747,795),(721,783),
             [(662,636),(706,649),(729,674),(734,711),(743,778),(730,790),(680,791),(680,766),(653,746),(651,722),(670,690),(669,658)]),
    'clear': ((701,1155,796,1327),(759,1314),
              [(734,1157),(773,1162),(790,1192),(779,1234),(788,1254),(794,1308),(783,1323),(704,1325),(699,1297),(704,1250),(706,1208),(712,1181)]),
}

def cutout(crop, box, key):
    rgb = np.asarray(crop)
    paper = (rgb.min(axis=2) >= 222) & (np.ptp(rgb, axis=2) <= 17)
    flood = Image.fromarray(np.where(paper, 255, 0).astype('uint8')).convert('RGB')
    ImageDraw.floodfill(flood, (0, 0), (127,127,127))
    outside = np.asarray(flood)[:,:,0] == 127
    # Drop isolated JPEG specks and soften the paper fringe, retaining the
    # interior colors and the whites that belong to the figure.
    labels, _ = ndimage.label(~outside)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    opaque = (labels > 0) & (sizes[labels] >= 28)
    edge = opaque & ~ndimage.binary_erosion(opaque, iterations=2)
    opacity = opaque.astype(float)
    opacity[edge] = np.clip((255-rgb.min(axis=2)[edge])/85, .1, 1)
    alpha = Image.fromarray(np.uint8(opacity*255))
    if key in white_caps:
        x0,y0,x1,y1 = white_caps[key]
        ImageDraw.Draw(alpha).ellipse((x0-box[0],y0-box[1],x1-box[0],y1-box[1]), fill=255)
    crop.putalpha(alpha)
    return crop

manifest = root / 'targets.json'
# These measured alignments belong to the crops below. Preserve them when
# regenerating the same assets. Recalibrate if a reference crop is replaced.
alignments = {view['id']: view['fromCanonical']
              for view in json.loads(manifest.read_text(encoding='utf-8'))
              if 'fromCanonical' in view}
targets = []
for key, name, box, shoe, target_box, anchor, polygon in placements:
    cutout(sheet.crop(box), box, key).save(root / 'characters' / f'{key}.png', optimize=True)
    views = [(key,photo,target_box,anchor,polygon),(key+'-alt',alternate,*alternate_placements[key])]
    for view, source, tile, foot, mask in views:
        # BRIEF inspects a neighborhood around each keypoint, so only the
        # printed marks qualify as centers and ring/hardware stay out of crop.
        x0,y0,x1,y1 = tile
        margin = 16
        left,top = x0-margin,y0-margin
        region = source.crop((left,top,x1+margin,y1+margin))
        region.save(root / 'targets' / f'{view}.jpg', quality=94, subsampling=0)
        targets.append(dict(id=view,kind=key,name=name,image=f'targets/{view}.jpg',
                            mask=[[x-left,y-top] for x,y in mask],
                            targetAnchor=[foot[0]-left,foot[1]-top],
                            sprite=dict(image=f'characters/{key}.png',anchor=[shoe[0]-box[0],shoe[1]-box[1]],
                                        scale=1.38,rotation=0,offset=[0,0],opacity=.87)))
        if view != key:
            targets[-1]['fromCanonical'] = alignments[view]
manifest.write_text(json.dumps(targets, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
