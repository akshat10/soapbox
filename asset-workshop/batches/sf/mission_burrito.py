"""Mission Missile: a modular tortilla chassis, game axes and dimensions.

Body envelope: 1.7 X 1.05 X 3.5; +Z is the exposed filling end.
The cockpit is genuinely open, with its seat surface at Y .22.
"""
from common import *


def _soft_piece(name, scale, loc, mat, parent):
    """Small, intentionally simple rounded filling and scorch accents."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8,
                                       radius=1, location=point(loc))
    obj = bpy.context.object
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, smooth=True)


def _wrap(name, rings, mat, parent, thickness=.065, cockpit=True):
    """An elliptical hollow wrap with omitted upper cockpit faces.

    Ring tuples are (Z, half width, half height). Outer and inner skins
    join along every boundary, including the real cockpit cutout.
    """
    count = 32
    verts = []
    for inset in (0, thickness):
        for z, rx, ry in rings:
            for j in range(count):
                angle = j * math.tau / count
                verts.append(((rx-inset)*math.cos(angle),
                              .005+(ry-inset)*math.sin(angle), z))
    layer = len(rings)*count
    faces = []
    surface = []
    for k in range(len(rings)-1):
        zmid = (rings[k][0]+rings[k+1][0])*.5
        for j in range(count):
            if cockpit and -.80 < zmid < .36 and 5 <= j < 11:
                continue
            a=k*count+j
            b=k*count+(j+1)%count
            c=(k+1)*count+(j+1)%count
            d=(k+1)*count+j
            surface.append((a,b,c,d))
            faces.append((a,b,c,d))
            faces.append((d+layer,c+layer,b+layer,a+layer))
    # Every unpaired skin edge becomes a rim wall; no Boolean artifacts.
    edges={}
    for face in surface:
        for a,b in zip(face, face[1:]+face[:1]):
            key=tuple(sorted((a,b)))
            if key in edges:
                edges[key]=None
            else:
                edges[key]=(a,b)
    for edge in edges.values():
        if edge is not None:
            a,b=edge
            faces.append((b,a,a+layer,b+layer))
    return mesh(name, verts, faces, mat, parent)


def build_mission_burrito():
    chassis=root('Mission Missile — burrito chassis')
    tortilla=material('Burrito Tortilla', '#F6DDAA', .73)
    toast=material('Burrito Toasted Gold', '#D39A54', .76)
    foil=material('Burrito Satin Foil', '#BED1D7', .40, .48)
    coral=material('Burrito Tomato Coral', '#EE806B', .58)
    mint=material('Burrito Lettuce Mint', '#83BA82', .66)
    blue=material('Burrito Mount Cobalt', '#4A718D', .49, .12)
    wood=material('Burrito Seat Wood', '#B88054', .67)
    beans=material('Burrito Pinto Beans', '#795A49', .74)

    # Rounded capsule sides. The .065-thick rim is actual geometry.
    rings=[(-1.67,.45,.30),(-1.54,.69,.40),(-1.27,.815,.44),
           (-.80,.815,.44),(.36,.815,.44),(.88,.805,.44),
           (1.39,.77,.425),(1.63,.735,.405)]
    _wrap('Rolled tortilla with open driver well',rings,tortilla,chassis)
    # End of the tortilla is folded closed behind the driver.
    _soft_piece('Rounded folded back',(.46,.30,.09),(0,.005,-1.64),tortilla,chassis)
    # Foil covers the rear half and respects the same open cockpit.
    foil_rings=[(-1.69,.455,.305),(-1.54,.705,.414),
                (-1.27,.83,.454),(-.80,.83,.454),(.04,.83,.454)]
    _wrap('Half-wrap satin foil',foil_rings,foil,chassis,.018)

    # Deliberate large foil creases: quiet sculpted facets, not noisy texture.
    for side in (-1,1):
        for i,z in enumerate((-1.22,-.84,-.46,-.10)):
            crease=box('Foil folded crease %s %s'%(side,i),
                       (.012,.19,.045),(side*.816,-.07+(i%2)*.11,z),
                       foil,chassis,bevel=.005,segments=2)
            set_rotation(crease,(.35 if i%2 else -.35,0,side*.10))

    # A low wooden soapbox runner and tiny plates leave all wheels separate.
    box('Wooden underside sled',(1.38,.105,3.23),(0,-.4725,-.015),
        wood,chassis,bevel=.045)
    for side in (-1,1):
        for z in (-1.18,1.18):
            box('Axle attachment plate',( .11,.18,.27),
                (side*.775,-.425,z),blue,chassis,bevel=.022)
            cylinder('Attachment bolt',.038,.017,
                     (side*.836,-.41,z),foil,chassis,axis='X',vertices=12,bevel=.006)

    # Opening X ±.40 / Z [-.67,.23] stays empty above the seat.
    box('Cockpit wooden seat',(.75,.075,.86),(0,.1825,-.25),
        wood,chassis,bevel=.035)
    for x in (-.24,0,.24):
        box('Seat plank score',(.009,.008,.74),(x,.216,-.25),
            toast,chassis,bevel=.002,segments=1)
    box('Low rear seat back',(.72,.24,.075),(0,.33,-.755),
        wood,chassis,bevel=.032)

    # Exposed cross-section: broad beans, rice, tomato and lettuce shapes.
    _soft_piece('Packed filling base',(.676,.35,.065),(0,.005,1.635),beans,chassis)
    filling=[
        (-.39,.15,.15,.12,mint),(-.14,.24,.12,.095,coral),
        (.15,.20,.17,.11,mint),(.43,.12,.12,.105,toast),
        (-.47,-.05,.095,.11,tortilla),(-.24,-.01,.13,.105,toast),
        (.01,.01,.13,.12,coral),(.27,-.005,.125,.09,mint),
        (.47,-.07,.095,.11,coral),(-.35,-.21,.11,.075,beans),
        (-.12,-.20,.11,.09,tortilla),(.12,-.21,.115,.08,tortilla),
        (.34,-.19,.12,.075,beans),(-.53,.075,.07,.065,coral),
    ]
    for i,(x,y,rx,ry,mat) in enumerate(filling):
        obj=_soft_piece('Filling ingredient %02d'%i,(rx,ry,.065),
                        (x,y,1.677),mat,chassis)
        set_rotation(obj,(0,0,(i%3-1)*.22))
    for x,y in ((-.02,.265),(.24,.10),(-.29,-.13),(.03,-.13)):
        rice=box('Cream rice grain',(.09,.038,.035),(x,y,1.727),
                 tortilla,chassis,bevel=.016,segments=2)
        set_rotation(rice,(0,0,.55))

    # A few baked patches on the intact front roof, matched to the study style.
    for i,(x,z) in enumerate(((-.23,.55),(.28,.68),(-.35,1.04),(.11,1.22))):
        ry=.44 if z<1 else .425
        y=.005+ry*math.sqrt(max(0,1-(x/.79)**2))
        patch=_soft_piece('Toasted tortilla spot %d'%i,
                          (.082,.012,.105),(x,y+.004,z),toast,chassis)
        set_rotation(patch,(0,0,-x*.6))

    chassis['asset_id']='mission_burrito'
    chassis['forward_axis']='+Z'
    chassis['seat_base_game']=[0,.22,-.25]
    chassis['cockpit_clearance']='X[-.40,.40] Z[-.67,.23] above Y .22'
    return chassis
