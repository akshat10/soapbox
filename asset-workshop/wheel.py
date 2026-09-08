"""Reusable Street Wheel, radius .5, tire width .27, axle along game X."""

from common import *


def _wheel_revolve(name, profile, mat, parent, radial_segments=48):
    """Revolve a closed (axial X, radius) profile around the game X axle."""
    verts = []
    for x, r in profile:
        for i in range(radial_segments):
            a = 2 * math.pi * i / radial_segments
            verts.append((x, r * math.cos(a), r * math.sin(a)))
    faces = []
    for row in range(len(profile)):
        following = (row + 1) % len(profile)
        for i in range(radial_segments):
            j = (i + 1) % radial_segments
            faces.append((row*radial_segments+i, row*radial_segments+j,
                          following*radial_segments+j, following*radial_segments+i))
    return mesh(name, verts, faces, mat, parent=parent)


def _wheel_tread(parent, mat):
    """One lightweight mesh of subtle shallow tread strips, shaped to the tire."""
    verts, faces = [], []
    # Three profile stations follow the crown of the tire rather than floating
    # rectangular blocks above it. Broad spaces keep detail readable at distance.
    for i in range(24):
        angle = 2 * math.pi * i / 24
        stations = [(-.09, .484), (0, .5005), (.09, .484)]
        start = len(verts)
        for x, radius in stations:
            # A small diagonal gives the rubber a manufactured tread direction.
            sweep = x * .40
            for side in [-1, 1]:
                a = angle + sweep + side * .010
                verts.append((x, radius * math.cos(a), radius * math.sin(a)))
        faces.extend([(start, start+1, start+3, start+2),
                      (start+2, start+3, start+5, start+4)])
    return mesh('StreetWheel_Subtle_Tread', verts, faces, mat, parent=parent)


def build_wheel():
    parent = root('StreetWheel')
    rubber = material('DD_Rubber', '#29373D', roughness=.87)
    rubber_detail = material('DD_RubberDetail', '#223038', roughness=.9)
    cream = material('DD_Cream', '#F3E6C8', roughness=.52)
    ink = material('DD_DeepInk', '#31474F', roughness=.63)
    metal = material('DD_Metal', '#BAC3B9', roughness=.36, metallic=.38)
    player = material('PlayerColor', '#DF6B55', roughness=.5)

    # Rounded tire shoulders and a slightly crowned tread are actual profile
    # geometry. Unlike a beveled cylinder, the center is open for the inset rim.
    tire_profile = [
        (-.101, .305), (-.124, .320), (-.135, .352),
        (-.134, .407), (-.121, .449), (-.102, .477),
        (-.068, .495), (0, .500), (.068, .495),
        (.102, .477), (.121, .449), (.134, .407),
        (.135, .352), (.124, .320), (.101, .305),
    ]
    _wheel_revolve('StreetWheel_Rubber_Tire', tire_profile, rubber, parent)
    _wheel_tread(parent, rubber_detail)

    cylinder('StreetWheel_Inset_Rim_Barrel', .316, .230, (0, 0, 0),
             cream, parent=parent, axis='X', vertices=48, bevel=.014)

    for side in [-1, 1]:
        # Soft lipped cream trim, a dark circular recess, and coral center make
        # a legible little automotive wheel from either side of the chassis.
        profile = [(side*.113, .258), (side*.124, .257),
                   (side*.132, .264), (side*.133, .303),
                   (side*.128, .322), (side*.118, .331),
                   (side*.108, .325), (side*.105, .307)]
        _wheel_revolve('StreetWheel_Cream_Lip_%d' % side, profile, cream, parent)
        cylinder('StreetWheel_Recess_%d' % side, .254, .012,
                 (side*.125, 0, 0), ink, parent=parent,
                 axis='X', vertices=40, bevel=.004)
        cylinder('StreetWheel_Player_Hub_%d' % side, .184, .033,
                 (side*.134, 0, 0), player, parent=parent,
                 axis='X', vertices=40, bevel=.01)
        cylinder('StreetWheel_Axle_Cap_%d' % side, .066, .013,
                 (side*.156, 0, 0), cream, parent=parent,
                 axis='X', vertices=24, bevel=.004)

        # Five restrained bolts nest inside the colored center, keeping the
        # silhouette and player color readable even in a distant race camera.
        for i in range(5):
            a = 2 * math.pi * i / 5 + math.pi/2
            y, z = .124 * math.cos(a), .124 * math.sin(a)
            cylinder('StreetWheel_Bolt_%d_%d' % (side, i), .020, .012,
                     (side*.154, y, z), metal, parent=parent,
                     axis='X', vertices=6, bevel=.003)

        # One tonal bead around each sidewall ties the rounded tire together.
        bead = [(side*.1330, .362), (side*.1360, .364),
                (side*.1365, .369), (side*.1340, .373)]
        _wheel_revolve('StreetWheel_Sidewall_Bead_%d' % side,
                       bead, rubber_detail, parent, radial_segments=48)

    parent['asset_id'] = 'standard'
    parent['wheel_radius'] = .5
    parent['tire_width'] = .27
    parent['game_axle'] = 'X'
    parent['player_material'] = 'PlayerColor'
    return parent
