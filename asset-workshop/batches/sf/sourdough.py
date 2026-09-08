"""Sourdough Starter: hollow scored loaf on a miniature wood soapbox frame."""
from common import *


def _sq(v, exponent=.5):
    return math.copysign(abs(v)**exponent, v)


def _opening(a, border=0):
    # A fourth-order superellipse encloses the complete driver clearance box.
    return ((.48+border)*_sq(math.cos(a)),
            -.22+(.59+border)*_sq(math.sin(a)))


def _face_up(obj):
    for poly in obj.data.polygons:
        if (AXES.transposed() @ poly.normal).y < 0:
            poly.flip()
    obj.data.update()


def build_sourdough():
    parent = root('SourdoughStarter_Chassis')
    crust = material('SF_BakedCrust', '#BC783A', roughness=.8)
    golden = material('SF_BakedGold', '#D59C55', roughness=.82)
    crumb = material('DD_Bread', '#EECF92', roughness=.84)
    cream = material('DD_Cream', '#F3E6C8', roughness=.52)
    wood = material('SF_SoapboxWood', '#95643F', roughness=.7)
    metal = material('DD_Metal', '#BAC3B9', roughness=.36, metallic=.38)
    ink = material('DD_DeepInk', '#31474F', roughness=.63)
    n = 80

    # The lower loaf is a compact boule with a broad rounded heel. The base is
    # closed; the top stays open and is joined to a separate scored crown below.
    rings = [(-.50, .67, 1.00), (-.42, .82, 1.17),
             (-.23, .89, 1.24), (-.07, .90, 1.25),
             (.13, .87, 1.20), (.36, .79, 1.09)]
    verts = [(rx*math.cos(2*math.pi*i/n), y, rz*math.sin(2*math.pi*i/n))
             for y, rx, rz in rings for i in range(n)]
    faces = [tuple(reversed(range(n)))]
    for row in range(len(rings)-1):
        faces += [(row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i)
                  for i in range(n)]
    mesh('Sourdough_Rounded_Crust', verts, faces, golden, parent=parent)

    # Scoring is a real depression in the crown mesh, with cream exposed inside
    # the cut. A small number of broad diagonal cuts replaces photo textures.
    def score(x, z):
        if z < .37 or abs(x) > .69:
            return 100
        return min(abs(z-(.63+.46*x)), abs(z-(.91+.46*x)))

    verts = []
    steps = 22
    for j in range(steps+1):
        t = j/steps
        for i in range(n):
            a = 2*math.pi*i/n
            ix, iz = _opening(a, .055)
            x = (1-t)*.79*math.cos(a) + t*ix
            z = (1-t)*1.09*math.sin(a) + t*iz
            y = .36+.24*t+.075*math.sin(math.pi*t)
            d = score(x,z)
            y -= .046 * max(0, 1-d/.051)
            verts.append((x,y,z))
    faces = []
    cut_mats = []
    for j in range(steps):
        for i in range(n):
            face = (j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)
            faces.append(face)
            x = sum(verts[k][0] for k in face)/4
            z = sum(verts[k][2] for k in face)/4
            cut_mats.append(1 if score(x,z)<.037 else 0)
    crown = mesh('Sourdough_Sculpted_Scored_Crown', verts, faces, crust, parent=parent)
    crown.data.materials.append(crumb)
    for poly, index in zip(crown.data.polygons, cut_mats):
        poly.material_index = index
    _face_up(crown)

    # A real open cockpit: cream bread cross-section, continuous inner walls,
    # and a floor below the driver's seat base. No hidden solid spans the hole.
    lip_rings = [(.600,.055), (.616,.038), (.610,.010), (.588,0)]
    verts = []
    for y, border in lip_rings:
        for i in range(n):
            x,z = _opening(2*math.pi*i/n,border)
            verts.append((x,y,z))
    faces = [(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i)
             for r in range(len(lip_rings)-1) for i in range(n)]
    lip = mesh('Sourdough_Cream_Cut_Edge', verts, faces, cream, parent=parent)
    _face_up(lip)

    verts = []
    for y in [.588,.16]:
        for i in range(n):
            x,z = _opening(2*math.pi*i/n)
            verts.append((x,y,z))
    faces = [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    faces.append(tuple(range(n,n*2)))
    interior = mesh('Sourdough_Open_Cockpit_Interior', verts, faces, crumb, parent=parent)
    # glTF uses single-sided materials: cavity normals must face the driver.
    for poly in interior.data.polygons:
        normal = AXES.transposed() @ poly.normal
        center = AXES.transposed() @ poly.center
        if (abs(normal.y) > .8 and normal.y < 0) or (
                abs(normal.y) <= .8 and normal.dot(Vector((center.x,0,center.z+.22))) > 0):
            poly.flip()
    interior.data.update()
    # Lower floor boards emphasize the handmade racer, without occupying any
    # of the required clear region above Y=.22.
    for i in range(3):
        box('Sourdough_Cockpit_Floor_%d'%i, (.25,.035,.86),
            ((i-1)*.26,.185,-.22), wood, parent=parent, bevel=.012)

    # A handful of intentional dimples replaces a noisy baked texture. Keep
    # them well outside the driver's hole, seated in the broad flank surfaces.
    for side in [-1,1]:
        for i,(z,y,ry,rz) in enumerate([(-.54,.02,.023,.037),
                                      (.20,-.05,.029,.042),
                                      (.62,-.13,.020,.032)]):
            rx = .89*math.sqrt(max(.1,1-(z/1.24)**2))
            sphere('Sourdough_Crust_Dimple_%d_%d'%(side,i),
                   (.012,ry,rz),(side*(rx+.004),y,z),crust,parent=parent)

    # Two wooden runners and crosspieces form the tiny soapbox mounting frame.
    for side in [-1,1]:
        box('Sourdough_Wood_Runner_%d'%side,(.16,.125,2.33),
            (side*.68,-.5625,0),wood,parent=parent,bevel=.027)
    for z in [-1.06,1.06]:
        box('Sourdough_Wood_Crosspiece_%s'%z,(1.67,.12,.18),
            (0,-.557,z),wood,parent=parent,bevel=.024)
    for side in [-1,1]:
        for end in [-1,1]:
            x,z=side*.818,end*.80
            box('Sourdough_Mount_%d_%d'%(side,end),(.115,.235,.23),
                (x,-.49,z),metal,parent=parent,bevel=.024)
            cylinder('Sourdough_Mount_Bolt_%d_%d'%(side,end),.033,.016,
                     (x+side*.065,-.49,z),ink,parent=parent,
                     axis='X',vertices=12,bevel=.005)

    parent['asset_id']='sourdough'
    parent['game_dimensions']=[1.8,1.25,2.5]
    parent['game_forward']='+Z'
    parent['driver_clearance']='X +/- .40, Z [-.67,.23], above Y .22'
    parent['artist_notes']='Original scored boule, genuinely hollow cockpit, wood soapbox frame.'
    return parent
