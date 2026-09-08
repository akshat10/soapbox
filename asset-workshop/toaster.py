"""Toast Malone: an original, Blender-native retro toaster chassis.

All measurements use the game's X-right / Y-up / Z-forward convention.
This builder intentionally excludes the separate wheel and driver assemblies.
"""

from common import *


def _rounded_slab(name, size, loc, mat, parent, corner=.12, edge=.006):
    """Thin Y extrusion whose plan-view corner radius is independent of thickness."""
    w, h, d = size
    x, y, z = loc
    r = min(corner, w / 2 - .001, d / 2 - .001)
    ring = []
    for cx, cz, angle in [(w/2-r, d/2-r, 0),
                           (-w/2+r, d/2-r, 90),
                           (-w/2+r, -d/2+r, 180),
                           (w/2-r, -d/2+r, 270)]:
        for j in range(9):
            a = math.radians(angle + j * 90 / 8)
            ring.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    n = len(ring)
    verts = [(x+u, y+side*h/2, z+v) for side in [-1, 1] for u, v in ring]
    faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    return mesh(name, verts, faces, mat, parent=parent, bevel=min(edge, h*.3))


def _loaf_outline(width=1.38, height=.64):
    """A softly shouldered loaf slice, clockwise in its Z/Y plane."""
    # The shaped crown is intentionally more generous than the lower loaf.
    # Subdivision is explicit so the exported silhouette has no curve dependency.
    anchors = [
        (-.42, .00), (-.46, .035), (-.46, .49), (-.49, .56),
        (-.50, .68), (-.47, .79), (-.38, .90), (-.22, .98),
        ( .00, 1.00), ( .22, .98), ( .38, .90), ( .47, .79),
        ( .50, .68), ( .49, .56), ( .46, .49), ( .46, .035),
        ( .42, .00),
    ]
    # A closed Catmull-Rom outline gives the bread a sculpted, puffy crown.
    outline = []
    count = len(anchors)
    for i in range(count):
        p0, p1 = anchors[(i - 1) % count], anchors[i]
        p2, p3 = anchors[(i + 1) % count], anchors[(i + 2) % count]
        for j in range(3):
            t = j / 3
            def cat(axis):
                a, b, c, d = p0[axis], p1[axis], p2[axis], p3[axis]
                return .5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t)
            outline.append((cat(0) * width, cat(1) * height))
    return outline


def _bread_layer(name, parent, center_x, center_z, bottom_y,
                 width, height, thickness, mat, bevel):
    outline = _loaf_outline(width, height)
    n = len(outline)
    verts = [(center_x + sx * thickness / 2, bottom_y + v, center_z + u)
             for sx in [-1, 1] for u, v in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1) % n, (i+1) % n + n, i+n) for i in range(n)]
    return mesh(name, verts, faces, mat, parent=parent, bevel=bevel)


def _front_dial(parent, cream, ink, metal, coral):
    # Separate rounded rings create a crisp, readable manufactured control.
    cylinder('Toaster_Dial_Socket', .225, .045, (0, -.14, 1.119),
             ink, parent=parent, axis='Z', vertices=48, bevel=.012)
    cylinder('Toaster_Dial_Trim', .202, .067, (0, -.14, 1.145),
             metal, parent=parent, axis='Z', vertices=48, bevel=.015)
    cylinder('Toaster_Dial_Face', .164, .081, (0, -.14, 1.18),
             cream, parent=parent, axis='Z', vertices=48, bevel=.022)
    # No typeface or texture dependency: a bold pointer and five tiny ticks.
    box('Toaster_Dial_Pointer', (.026, .076, .012), (0, -.053, 1.226),
        ink, parent=parent, bevel=.009)
    for i, angle in enumerate([-65, -33, 0, 33, 65]):
        a = math.radians(angle)
        tick = box('Toaster_Dial_Tick_%02d' % i, (.015, .032, .008),
                   (.26 * math.sin(a), -.14 + .26 * math.cos(a), 1.126),
                   ink, parent=parent, bevel=.004)
        set_rotation(tick, (0, 0, -a))
    cylinder('Toaster_Indicator_Socket', .055, .026, (.43, -.13, 1.111),
             ink, parent=parent, axis='Z', vertices=24, bevel=.007)
    cylinder('Toaster_Indicator_Lamp', .036, .037, (.43, -.13, 1.13),
             coral, parent=parent, axis='Z', vertices=24, bevel=.012)


def build_toaster():
    parent = root('ToastMalone_Chassis')
    cream = material('DD_Cream', '#F3E6C8', roughness=.52)
    butter = material('DD_Butter', '#E9B851', roughness=.43)
    ink = material('DD_DeepInk', '#31474F', roughness=.63)
    coral = material('DD_Coral', '#DF6B55', roughness=.5)
    metal = material('DD_Metal', '#BAC3B9', roughness=.36, metallic=.38)
    crust = material('DD_Crust', '#AC6132', roughness=.82)
    bread = material('DD_Bread', '#EECF92', roughness=.84)
    toasted = material('DD_ToastPores', '#C69959', roughness=.87)

    # Softly rounded shell, grounded by a narrow dark undertray. The wide bevel
    # belongs to the silhouette; small detail bevels have a different scale.
    box('Toaster_Main_Shell', (1.65, 1.065, 2.26), (0, -.008, 0), butter,
        parent=parent, bevel=.19, segments=6)
    _rounded_slab('Toaster_Base_Undertray', (1.61, .105, 2.25), (0, -.522, 0),
                  ink, parent, corner=.19, edge=.018)
    _rounded_slab('Toaster_Base_Chrome_Line', (1.622, .032, 2.262), (0, -.459, 0),
                  metal, parent, corner=.196, edge=.006)
    _rounded_slab('Toaster_Top_Plate', (1.48, .074, 2.09), (0, .535, 0),
                  cream, parent, corner=.19, edge=.012)

    # Slot rims and deep charcoal wells read as deliberate recesses. Bread sits
    # partially inside the wells so the top never reads as a solid yellow block.
    for i, x in enumerate([-.51, .51]):
        _rounded_slab('Toaster_Slot_Rim_%d' % i, (.342, .020, 1.77),
                      (x, .576, 0), metal, parent, corner=.16, edge=.004)
        _rounded_slab('Toaster_Slot_Well_%d' % i, (.283, .023, 1.665),
                      (x, .585, 0), ink, parent, corner=.137, edge=.004)
        # Slim inner end rails make the bread insertion legible from above.
        for end in [-1, 1]:
            box('Toaster_Slot_End_%d_%d' % (i, end), (.22, .019, .024),
                (x, .602, end * .735), metal, parent=parent, bevel=.008)

        z = -.035 if i == 0 else .035
        bottom = .467 + i * .035
        height = .632 - i * .035
        _bread_layer('Toast_%d_Crust' % i, parent, x, z, bottom,
                     1.37, height, .208, crust, .027)
        # Cream bread has a real raised face on both sides, with a consistent
        # crust border around the entire softly shaped silhouette.
        for side in [-1, 1]:
            face_x = x + side * .103
            _bread_layer('Toast_%d_Crumb_%d' % (i, side), parent,
                         face_x, z, bottom + .053, 1.18, height - .115,
                         .036, bread, .012)
            for k, (u, v, radius) in enumerate([(-.32, .25, .021),
                                               (.24, .34, .018),
                                               (-.04, .43, .022)]):
                # Sparse low-contrast pores are sculpted ellipses, never noise.
                sphere('Toast_%d_Pore_%d_%d' % (i, side, k),
                       (.006, radius * .72, radius),
                       (face_x + side * .019, bottom + v, z + u),
                       toasted, parent=parent)

    # Right-side carriage lever: dark rail inset into an ivory surround.
    box('Toaster_Lever_Plate', (.033, .44, .205), (.816, .024, .35),
        cream, parent=parent, bevel=.015, segments=4)
    box('Toaster_Lever_Rail', (.037, .34, .051), (.835, .025, .35),
        ink, parent=parent, bevel=.018, segments=4)
    box('Toaster_Lever_Stem', (.139, .046, .049), (.887, .102, .35),
        metal, parent=parent, bevel=.014)
    box('Toaster_Lever_Handle', (.185, .084, .215), (.946, .106, .35),
        ink, parent=parent, bevel=.037, segments=5)
    box('Toaster_Lever_Cap', (.135, .014, .162), (.955, .152, .35),
        cream, parent=parent, bevel=.006)

    _front_dial(parent, cream, ink, metal, coral)

    # The back and left side also receive useful form and modest detail.
    box('Toaster_Crumb_Drawer_Seam', (1.025, .067, .02), (0, -.345, -1.12),
        ink, parent=parent, bevel=.009)
    box('Toaster_Crumb_Drawer', (.974, .047, .035), (0, -.34, -1.13),
        cream, parent=parent, bevel=.013)
    box('Toaster_Crumb_Drawer_Pull', (.25, .042, .075), (0, -.323, -1.15),
        metal, parent=parent, bevel=.018)
    for i in range(4):
        box('Toaster_Left_Vent_%d' % i, (.016, .019, .26),
            (-.823, -.15 + i * .071, -.39), ink,
            parent=parent, bevel=.007, segments=3)
    box('Toaster_Left_Maker_Badge', (.023, .105, .277), (-.827, .22, .48),
        cream, parent=parent, bevel=.01)
    for i, dz in enumerate([-.063, 0, .063]):
        box('Toaster_Badge_Bar_%d' % i, (.009, .032 + i*.012, .025),
            (-.844, .22, .48 + dz), butter, parent=parent, bevel=.004)

    parent['asset_id'] = 'toaster'
    parent['artist_notes'] = 'Original rounded retro toaster; separate wheels and driver.'
    parent['game_dimensions'] = [1.65, 1.15, 2.3]
    parent['game_forward'] = '+Z'
    return parent
