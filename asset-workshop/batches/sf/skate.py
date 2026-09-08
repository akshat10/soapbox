"""One Skate-Park Wheel: radius .33, overall width .24, game X axle."""
from common import *


def _revolve(name, profile, mat, parent, segments=40):
    """Closed radial profile, with dimensions expressed in game coordinates."""
    verts=[]
    for x,radius in profile:
        for i in range(segments):
            angle=i*math.tau/segments
            verts.append((x,radius*math.cos(angle),radius*math.sin(angle)))
    faces=[]
    for row in range(len(profile)):
        following=(row+1)%len(profile)
        for i in range(segments):
            j=(i+1)%segments
            faces.append((row*segments+i,row*segments+j,
                          following*segments+j,following*segments+i))
    return mesh(name,verts,faces,mat,parent)


def build_skate():
    wheel=root('Skate-Park Wheel')
    cream=material('Skate Cream Polyurethane','#F5E4B9',.58)
    molded=material('Skate Molded Sidewall','#E2CDA1',.66)
    coral=material('Skate Coral Bearing Seat','#DF7B64',.51)
    cobalt=material('Skate Cobalt Bearing Seal','#395B82',.50)
    metal=material('Skate Brushed Hub','#BECAC9',.35,.43)
    player=material('PlayerColor','#DF6B55',.5)

    # The broad cylindrical tread and rounded shoulders distinguish this
    # small polyurethane wheel from both scooter rubber and transit discs.
    # Nothing extends beyond .33 radius or X +/- .12.
    profile=[(-.082,.128),(-.105,.137),(-.117,.164),
             (-.119,.265),(-.112,.301),(-.088,.323),(-.052,.330),
             (.052,.330),(.088,.323),(.112,.301),(.119,.265),
             (.117,.164),(.105,.137),(.082,.128)]
    _revolve('Chunky rounded cream polyurethane',profile,cream,wheel,48)

    # A through barrel seats the two matching face bearings.
    cylinder('Coral bearing barrel',.137,.190,(0,0,0),coral,
             wheel,axis='X',vertices=32,bevel=.007)
    for side in (-1,1):
        # Smooth recessed coral ring, with a restrained cobalt seal inside.
        _revolve('Coral inset bearing lip %d'%side,
                 [(side*.088,.079),(side*.110,.079),
                  (side*.117,.089),(side*.117,.115),
                  (side*.112,.133),(side*.100,.141),(side*.087,.131)],
                 coral,wheel,32)
        _revolve('Cobalt bearing seal %d'%side,
                 [(side*.103,.048),(side*.113,.048),
                  (side*.115,.054),(side*.115,.078),
                  (side*.110,.086),(side*.102,.086)],
                 cobalt,wheel,32)
        cylinder('Brushed bearing hub %d'%side,.051,.018,
                 (side*.105,0,0),metal,wheel,
                 axis='X',vertices=24,bevel=.003)
        cylinder('Player color axle cap %d'%side,.023,.008,
                 (side*.116,0,0),player,wheel,
                 axis='X',vertices=16,bevel=.002)

        # Two shallow concentric molded seams stay within the sidewall.
        _revolve('Outer molded sidewall ring %d'%side,
                 [(side*.118,.247),(side*.1195,.249),
                  (side*.120,.252),(side*.119,.255),(side*.117,.253)],
                 molded,wheel,40)
        _revolve('Inner molded sidewall ring %d'%side,
                 [(side*.117,.168),(side*.1185,.171),
                  (side*.119,.174),(side*.1175,.177),(side*.116,.175)],
                 cream,wheel,40)

    wheel['asset_id']='skate'
    wheel['wheel_radius']=.33
    wheel['tire_width']=.24
    wheel['game_axle']='X'
    wheel['player_material']='PlayerColor'
    wheel['module_count']=1
    return wheel
