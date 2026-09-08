"""Rent Controlled: a mint Victorian porch repurposed as a derby chassis.

Original sculpted interpretation of the porch concept. Game-space dimensions
are 2.2 W x 2.3 H x 2.9 L, with the driver seated inside the architectural shell.
"""
from common import *


def build_painted_porch():
    r = root('RentControlled_PaintedPorch')
    mint = material('SF_PorchMint', '#7BAE9C', roughness=.63)
    cream = material('SF_PorchCream', '#F1DDB2', roughness=.58)
    cobalt = material('SF_PorchCobalt', '#35648D', roughness=.63)
    coral = material('SF_PorchCoral', '#D8755D', roughness=.59)
    dark = material('SF_PorchUndercarriage', '#374550', roughness=.68)
    metal = material('SF_PorchMountMetal', '#899CA0', roughness=.40, metallic=.35)

    def B(name, size, loc, mat=cream, bevel=.018):
        return box('Porch_'+name, size=size, loc=loc, mat=mat, parent=r,
                   bevel=bevel, segments=2)

    def lathe(name, x, y, z, profile, mat, segments=10):
        verts=[]
        for height,radius in profile:
            for j in range(segments):
                a=2*math.pi*j/segments
                verts.append((x+radius*math.cos(a),y+height,z+radius*math.sin(a)))
        faces=[tuple(reversed(range(segments)))]
        for k in range(len(profile)-1):
            for j in range(segments):
                a=k*segments+j;b=k*segments+(j+1)%segments
                faces.append((a,b,b+segments,a+segments))
        faces.append(tuple(range((len(profile)-1)*segments,len(profile)*segments)))
        return mesh('Porch_'+name,verts=verts,faces=faces,mat=mat,parent=r)

    def rake(name,a,b,width=.07,depth=.08,mat=cream):
        dx,dy=b[0]-a[0],b[1]-a[1]
        ob=B(name,(math.hypot(dx,dy),width,depth),
             tuple((a[i]+b[i])/2 for i in range(3)),mat,.012)
        set_rotation(ob,(0,0,math.atan2(dy,dx)))
        return ob

    # Painted deck planks are separated by quiet grooves and a cream nosing.
    B('ChassisBeam',(1.95,.17,2.66),(0,-1.055,0),dark,.035)
    for i in range(7):
        B('DeckPlank_%02d'%i,(.302,.15,2.85),((i-3)*.309,-.950,0),mint,.014)
    B('FrontNosing',(2.18,.13,.13),(0,-.953,1.365),cream,.020)
    B('RearNosing',(2.18,.13,.13),(0,-.953,-1.365),mint,.020)
    for side in (-1,1):
        B('SideFascia',(.105,.19,2.80),(side*1.032,-.991,0),mint,.019)
        for zi,z in enumerate((-.95,.95)):
            B('AttachmentPlate_%d_%d'%(side,zi),(.06,.25,.24),
              (side*1.067,-1.007,z),metal,.025)
            cylinder('Porch_MountBolt',radius=.035,depth=.014,
                     loc=(side*1.098,-1.010,z),mat=dark,parent=r,
                     axis='X',vertices=8,bevel=.004)

    # Railings flank the deck. The entire front remains open for the driver.
    for side in (-1,1):
        x=side*.938
        B('BalustradeBottom',(.13,.10,2.17),(x,-.773,.145),cream,.015)
        B('BalustradeHandrail',(.16,.11,2.23),(x,-.182,.145),coral,.023)
        for zi,z in enumerate((-.86,1.16)):
            B('NewelBase_%d_%d'%(side,zi),(.26,.17,.26),(x,-.777,z),cream,.018)
            B('Newel_%d_%d'%(side,zi),(.17,.65,.17),(x,-.45,z),cream,.018)
            B('NewelInset_%d_%d'%(side,zi),(.023,.39,.095),
              (x+side*.095,-.442,z),coral,.008)
            B('NewelCap_%d_%d'%(side,zi),(.265,.08,.265),(x,-.090,z),cream,.016)
            lathe('NewelFinial_%d_%d'%(side,zi),x,-.05,z,
                  [(0,.07),(.045,.09),(.105,.075),(.135,.037),(.16,.025)],coral,12)
        for j in range(7):
            z=-.64+j*.264
            lathe('TurnedBaluster_%d_%d'%(side,j),x,-.725,z,
                  [(0,.042),(.055,.044),(.10,.027),(.18,.043),
                   (.26,.066),(.33,.053),(.39,.026),(.46,.041),(.49,.042)],
                  cream,10)

    # The little blue bench is inside, low enough to suit the driver contract.
    B('SeatPedestal',(1.16,.20,.84),(0,-.785,-.24),mint,.035)
    B('SeatCushion',(1.22,.11,.89),(0,-.685,-.24),cobalt,.046)
    B('SeatBack',(1.20,.70,.13),(0,-.300,-.815),cobalt,.048)
    for x in (-.38,0,.38):
        B('SeatBackSeam',(.014,.53,.015),(x,-.285,-.742),mint,.006)
    # Back wall and real framing make the canopy structurally understandable.
    B('BackWall',(1.85,1.39,.13),(0,-.18,-1.215),mint,.028)
    for i in range(5):
        B('BackSiding_%d'%i,(1.72,.020,.022),(0,-.67+i*.25,-1.137),cream,.004)
    for x in (-.82,.82):
        B('RearPilaster',(.15,1.49,.20),(x,-.137,-1.18),cream,.017)
        B('RearPilasterInset',(.073,1.10,.021),(x,-.14,-1.067),cobalt,.006)

    # Two turned forward columns leave X +/- .40 and the front view clear.
    for side in (-1,1):
        x=side*.83;z=.075
        B('CanopyPostFoot',(.25,.23,.25),(x,-.751,z),cream,.023)
        B('CanopyPostPlinth',(.18,.34,.18),(x,-.478,z),cream,.021)
        lathe('CanopyTurnedColumn',x,-.31,z,
              [(0,.068),(.075,.093),(.14,.069),(.23,.058),
               (.55,.053),(.65,.079),(.70,.065),(.79,.073)],cream,12)
        B('CanopyCapital',(.255,.105,.26),(x,.515,z),cream,.021)

    # Compact gable: lowest overhead crossbeam is Y .505; crest is <= 1.15.
    # Roof is open beneath and has no geometry in the driver's head clearance.
    B('FrontEntablature',(1.96,.13,.15),(0,.57,.075),cream,.020)
    B('RearEntablature',(1.96,.13,.17),(0,.57,-1.20),cream,.020)
    for side in (-1,1):
        B('SideEntablature',(.15,.13,1.52),(side*.905,.57,-.565),cream,.020)
        wing=[(0,1.100,-1.40),(side*1.04,.68,-1.40),
              (side*1.04,.68,.235),(0,1.100,.235)]
        vertices=wing+[(x,y-.078,z) for x,y,z in wing]
        mesh('Porch_CanopySlope',verts=vertices,
             faces=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],
             mat=cobalt,parent=r,bevel=.014)
        B('Eave',(.095,.09,1.67),(side*1.033,.649,-.5825),cream,.013)
    B('RidgeCap',(.09,.07,1.68),(0,1.114,-.58),cobalt,.023)
    for z in (.241,-1.407):
        rake('GableRake',(-1.038,.646,z),(0,1.09,z),.078,.082)
        rake('GableRake',(0,1.09,z),(1.038,.646,z),.078,.082)
    # Large gingerbread motifs remain readable at chase-camera distance.
    B('GableTie',(1.87,.065,.085),(0,.662,.239),cream,.013)
    B('GableKingPost',(.07,.29,.075),(0,.822,.245),cream,.014)
    for side in (-1,1):
        rake('GingerbreadBrace',(side*.13,.724,.245),(side*.48,.87,.245),.065,.080,coral)
        for j,x in enumerate((.23,.47,.69)):
            # A small solid drop combines rectangular head and rounded diamond.
            xx=side*x
            B('GingerbreadDrop',(.055,.115,.07),(xx,.657,.246),cream,.012)
            ob=B('GingerbreadDiamond',(.061,.061,.070),(xx,.578,.246),coral,.010)
            set_rotation(ob,(0,0,math.pi/4))
    # Roof course seams use four broad strips rather than high-frequency tiles.
    for side in (-1,1):
        for i in (1,2,3):
            x=side*(i*.247)
            yy=1.10-abs(x)*(.42/1.04)+.012
            strip=B('RoofCourse',(.030,.027,1.53),(x,yy,-.583),cobalt,.005)
            set_rotation(strip,(0,0,-side*math.atan2(.42,1.04)))
    r['asset_id']='painted_porch'
    r['display_name']='Rent Controlled'
    r['nominal_dimensions']='2.2,2.3,2.9'
    r['seat_base_y']=-.63
    r['forward_axis']='+Z'
    return r
