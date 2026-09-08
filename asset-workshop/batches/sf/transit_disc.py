"""One original transit-inspired cobalt/cream wheel; no paired axle or logo."""
from common import *


def build_transit_disc():
    r = root('BARTDiscs_TransitDisc')
    cream = material('SF_TransitCream', '#F1DDB2', roughness=.54)
    cobalt = material('SF_TransitCobalt', '#265C95', roughness=.47)
    steel = material('SF_TransitSteel', '#8E9BA0', roughness=.40, metallic=.48)
    player = material('PlayerColor', '#D97962', roughness=.48)

    def spin(name, profile, mat, closed=False, segments=48):
        # Rotate an X/radius section around the game's X axle. Profile edges
        # supply the small manufactured bevels explicitly, avoiding subdivision.
        verts=[]
        for x,radius in profile:
            for j in range(segments):
                a=2*math.pi*j/segments
                verts.append((x,radius*math.cos(a),radius*math.sin(a)))
        faces=[]
        rings=len(profile)
        for i in range(rings if closed else rings-1):
            nxt=(i+1)%rings
            for j in range(segments):
                k=(j+1)%segments
                faces.append((i*segments+j,i*segments+k,nxt*segments+k,nxt*segments+j))
        if not closed:
            faces.append(tuple(reversed(range(segments))))
            faces.append(tuple(range((rings-1)*segments,rings*segments)))
        return mesh('TransitDisc_'+name,verts=verts,faces=faces,mat=mat,parent=r)

    def disc(name, x, radius, depth, mat, segments=48):
        b=min(.008,depth*.30)
        return spin(name,[(x-depth/2,radius-b),(x-depth/2+b,radius),
                          (x+depth/2-b,radius),(x+depth/2,radius-b)],
                    mat,segments=segments)

    # Constant rolling radius, with the tread softly easing into each shoulder.
    # There are no protruding treads, lugs, or decorative shapes outside R=.64.
    spin('SteelRollingRim',[
        (-.142,.560),(-.137,.602),(-.112,.631),(-.079,.640),
        (.079,.640),(.112,.631),(.137,.602),(.142,.560),
        (.109,.536),(-.109,.536),
    ],steel,closed=True)

    # Both sides receive the same concentric graphic treatment. These are
    # shallow enamel discs with native edge geometry, not flat texture decals.
    for side in (-1,1):
        suffix='L' if side<0 else 'R'
        disc('CreamFace_'+suffix,side*.129,.568,.012,cream)
        disc('CobaltBand_'+suffix,side*.137,.383,.009,cobalt)
        disc('CreamHubField_'+suffix,side*.143,.196,.008,cream)
        disc('SteelHub_'+suffix,side*.146,.116,.006,steel,32)
        disc('PlayerCenter_'+suffix,side*.148,.060,.004,player,24)

    r['asset_id']='transit_disc'
    r['display_name']='BART Discs'
    r['rolling_radius']=.64
    r['wheel_width']=.30
    r['axle_axis']='X'
    return r
