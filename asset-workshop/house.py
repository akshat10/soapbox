"""Original Painted Lady model for Doodle Derby's first Blender asset study.

Dimensions and coordinates are in the game's Y-up space.  This file deliberately
builds geometry and ordinary PBR materials only: no baked light or image texture.
"""
from common import *


def build_house():
    r = root('PaintedLady')
    facade = material('Facade', '#2F69AD', roughness=.64)
    trim = material('VictorianCream', '#F2DEAF', roughness=.56)
    stone = material('FoundationWarmStone', '#B3A994', roughness=.80)
    roof = material('VictorianRoof', '#273D58', roughness=.65)
    glass = material('VictorianWindowGlass', '#294F67', roughness=.29)
    reflection = material('VictorianGlassHighlight', '#688E9F', roughness=.38)
    door = material('VictorianDoorOchre', '#CF9448', roughness=.56)
    metal = material('VictorianHardware', '#635743', roughness=.36, metallic=.35)

    def B(name, size, loc, mat=trim, bevel=.025):
        return box(name, size=size, loc=loc, mat=mat, parent=r,
                   bevel=bevel, segments=3)

    def prism(name, outline, bottom, top, mat, bevel=.018):
        # Outline is X,Z; mesh() converts game space to native Blender space.
        n = len(outline)
        v = [(x,bottom,z) for x,z in outline] + [(x,top,z) for x,z in outline]
        f = [tuple(reversed(range(n))), tuple(range(n,2*n))]
        f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return mesh(name, verts=v, faces=f, mat=mat, parent=r, bevel=bevel)

    def beam(name, a, b, width=.085, depth=.11, mat=trim):
        # Raking trim in a facade plane, with a rectangular section.
        dx,dy = b[0]-a[0], b[1]-a[1]
        o = B(name, (math.hypot(dx,dy),width,depth),
              tuple((a[i]+b[i])/2 for i in range(3)), mat, .014)
        set_rotation(o, (0,0,math.atan2(dy,dx)))
        return o

    def window(name, x, y, z, width=.70, height=1.12, turn=0,
               chunky=True):
        # Local x lies along the facade and local +z points away from it.
        # Rotation about game Y permits windows on the angled bay and rear.
        c,s = math.cos(turn), math.sin(turn)
        def P(label, dims, u, v, out, mat, bevel=.015):
            loc = (x+c*u+s*out, y+v, z-s*u+c*out)
            o = B(name+'_'+label, dims, loc, mat, bevel)
            set_rotation(o, (0,turn,0))
            return o
        P('Recess', (width+.16,height+.16,.07), 0,0,.005, roof)
        P('Glass', (width,height,.075), 0,0,.05,glass,.010)
        # A large quiet area of blue glass provides a designed reflection.
        P('UpperLight', (width-.08,height*.35,.015), 0,height*.20,.093,
          reflection,.007)
        for u in (-width/2-.025, width/2+.025):
            P('Jamb', (.075,height+.15,.14), u,0,.087,trim,.015)
        for v in (-height/2-.030,height/2+.030):
            P('Rail', (width+.15,.080,.14),0,v,.087,trim,.015)
        P('MeetingRail', (width,.054,.10),0,.01,.12,trim,.010)
        P('Mullion', (.037,height,.10),0,0,.12,trim,.008)
        P('Sill', (width+.23,.090,.23),0,-height/2-.09,.11,trim,.020)
        if chunky:
            P('Lintel', (width+.27,.12,.22),0,height/2+.13,.095,trim,.021)
        return P

    def arch(name, x, bottom, z, width, height, depth, mat):
        radius = width/2
        spring = bottom+height-radius
        outline = [(x-radius,bottom),(x+radius,bottom),(x+radius,spring)]
        for i in range(1,17):
            a=math.pi*i/16
            outline.append((x+radius*math.cos(a),spring+radius*math.sin(a)))
        n=len(outline)
        v=[(xx,yy,z-depth/2) for xx,yy in outline]
        v += [(xx,yy,z+depth/2) for xx,yy in outline]
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return mesh(name,verts=v,faces=f,mat=mat,parent=r,bevel=.012)

    # Main two-storey volume. Blue siding remains the single tintable Facade
    # material, including ribs, corners, and the broad polygonal bay surfaces.
    B('Foundation', (3.38,.36,3.78), (0,.18,0), stone,.055)
    B('MainVolume', (3.30,4.22,3.70), (0,2.39,0), facade,.035)
    B('WaterTable', (3.43,.15,3.84), (0,.40,0), trim,.026)
    # Gentle horizontal rhythm: twelve shallow seams, not individual shingles.
    for i,y in enumerate([.76,1.07,1.38,1.69,2.00,2.31,2.72,3.03,3.34,3.65,3.96,4.27]):
        B('FrontSiding_%02d'%i, (3.29,.026,.022),(0,y,1.853),facade,.005)
        B('RearSiding_%02d'%i, (3.29,.026,.022),(0,y,-1.853),facade,.005)
        B('LeftSiding_%02d'%i, (.022,.026,3.70),(-1.653,y,0),facade,.005)
        B('RightSiding_%02d'%i, (.022,.026,3.70),(1.653,y,0),facade,.005)
    for x in (-1.605,1.605):
        for z in (-1.82,1.82):
            B('CornerBoard', (.115,4.12,.115),(x,2.42,z),trim,.012)
    B('StoreyBand', (3.40,.125,3.80),(0,2.52,0),trim,.020)
    B('CorniceLower', (3.46,.105,3.86),(0,4.43,0),trim,.021)
    B('CorniceUpper', (3.60,.15,3.97),(0,4.56,0),trim,.025)

    # Chamfered bay: all three visible faces are built and glazed separately.
    bay=[(-1.40,1.80),(-1.40,2.14),(-1.14,2.43),(-.35,2.43),(-.06,2.14),(-.06,1.80)]
    prism('BayVolume',bay,.49,4.36,facade,.025)
    def bay_ring(name,y,h,expand=1.035,mat=trim):
        cx,cz=-.73,2.08
        p=[(cx+(x-cx)*expand,cz+(z-cz)*expand) for x,z in bay]
        return prism(name,p,y-h/2,y+h/2,mat,.018)
    bay_ring('BayBase',.54,.17,1.08)
    bay_ring('BayLowerApron',.82,.13,1.045)
    bay_ring('BayStoreyCornice',2.53,.15,1.06)
    bay_ring('BayUpperApron',2.82,.10,1.04)
    bay_ring('BayTopFrieze',4.26,.19,1.045)
    bay_ring('BayCornice',4.40,.13,1.115)

    # Window orientation is derived from the outside normal of each face.
    bay_faces=[(bay[1],bay[2]),(bay[2],bay[3]),(bay[3],bay[4])]
    for fi,(a,b) in enumerate(bay_faces):
        dx,dz=b[0]-a[0],b[1]-a[1]
        angle=math.atan2(-dz,dx)
        span=math.hypot(dx,dz)
        xx,zz=(a[0]+b[0])/2,(a[1]+b[1])/2
        for level,yy in enumerate((1.68,3.59)):
            window('Bay_%d_%d'%(fi,level),xx,yy,zz,
                   width=max(.24,span-.16),height=1.10,turn=angle,chunky=False)
            # A framed panel below each window helps the bay read as crafted
            # architecture without the need for small noisy ornament.
            cc,ss=math.cos(angle),math.sin(angle)
            panel=B('BayPanel_%d_%d'%(fi,level), (max(.18,span-.16),.23,.028),
                    (xx+ss*.016,yy-.79,zz+cc*.016),trim,.014)
            set_rotation(panel,(0,angle,0))
    for x,z in bay[1:5]:
        B('BayCornerPost',(.075,3.61,.075),(x,2.40,z),trim,.015)
        B('BayPostCapital',(.13,.10,.13),(x,4.12,z),trim,.015)
    # Bay cornice dentils are intentionally large enough to read in the game.
    for x in (-1.07,-.84,-.61,-.38):
        B('BayDentil',(.095,.13,.13),(x,4.18,2.48),trim,.014)

    # Recessed entrance to the right of the bay, with a warm ochre door.
    B('DoorShadow',(.94,1.95,.075),(.91,1.47,1.89),roof,.025)
    B('Door',(.76,1.77,.075),(.91,1.47,1.955),door,.026)
    for yy,hh in ((1.02,.43),(1.80,.67)):
        B('DoorRaisedPanel',(.57,hh,.032),(.91,yy,2.007),trim,.026)
        B('DoorPanelInset',(.47,hh-.10,.025),(.91,yy,2.031),door,.015)
    B('DoorTopGlass',(.65,.23,.04),(.91,2.17,2.018),glass,.018)
    for x in (.43,1.39):
        B('DoorPilaster',(.12,2.03,.20),(x,1.47,1.99),trim,.020)
        B('DoorPilasterFoot',(.17,.22,.23),(x,.56,2.01),trim,.020)
        B('DoorPilasterCapital',(.17,.13,.23),(x,2.44,2.01),trim,.020)
    B('DoorLintel',(1.12,.13,.25),(.91,2.50,2.01),trim,.023)
    B('DoorCanopy',(1.20,.13,.40),(.91,2.63,2.045),roof,.025)
    sphere('DoorKnob',scale=(.045,.045,.045),loc=(1.17,1.38,2.08),mat=metal,parent=r)
    # Three compact steps terminate exactly at the local ground plane.
    B('EntryLowerStep',(1.15,.14,.99),(.91,.07,2.22),stone,.026)
    B('EntryMiddleStep',(1.08,.28,.70),(.91,.14,2.14),trim,.026)
    B('EntryUpperStep',(1.00,.43,.41),(.91,.215,2.06),trim,.026)
    B('DoorThreshold',(.90,.12,.30),(.91,.49,1.99),stone,.019)
    # Slim handrail and two small posts are enough to mark the entry.
    for x in (.35,1.47):
        for z,y in ((2.52,.61),(2.06,.88)):
            B('EntryRailPost',(.045,.65,.045),(x,y-.31,z),metal,.010)
        curve_tube('EntryHandrail',points=[(x,.70,2.57),(x,.96,2.04)],
                   radius=.026,mat=metal,parent=r)
    window('FrontUpper',.91,3.54,1.868,width=.71,height=1.18)

    # Simple real windows on the other elevations support orbit and race views.
    for side in (-1,1):
        for zi,z in enumerate((-.98,.58)):
            for level,yy in enumerate((1.60,3.52)):
                window('Side_%d_%d_%d'%(side,zi,level),side*1.666,yy,z,
                       width=.69,height=1.06,turn=side*math.pi/2)
    for xi,x in enumerate((-.81,.81)):
        for level,yy in enumerate((1.60,3.52)):
            window('Rear_%d_%d'%(xi,level),x,yy,-1.866,
                   width=.73,height=1.10,turn=math.pi)

    # Full-depth pitched roof; cream raking trim wraps both gable ends.
    v=[(-1.65,4.50,-1.85),(1.65,4.50,-1.85),(0,6.02,-1.85),
       (-1.65,4.50,1.85),(1.65,4.50,1.85),(0,6.02,1.85)]
    mesh('GableVolume',verts=v,faces=[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],
         mat=facade,parent=r,bevel=.016)
    for side in (-1,1):
        # The thickness is in Y, preserving a crisp but softened eave edge.
        wing=[(0,6.16,-2.045),(side*1.85,4.60,-2.045),
              (side*1.85,4.60,2.045),(0,6.16,2.045)]
        vv=wing+[(x,y-.13,z) for x,y,z in wing]
        mesh('RoofSlope',verts=vv,
             faces=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],
             mat=roof,parent=r,bevel=.025)
        B('EaveFascia',(.12,.15,4.11),(side*1.82,4.56,0),trim,.023)
        for zi,z in enumerate((-1.54,-.83,-.12,.59,1.30)):
            B('EaveCorbel_%d_%d'%(side,zi),(.20,.19,.105),
              (side*1.685,4.38,z),trim,.025)
    B('RoofRidge',(.12,.13,4.14),(0,6.155,0),roof,.045)
    for z in (-2.02,2.02):
        beam('RakingFascia',(-1.84,4.55,z),(0,6.12,z),.115,.13)
        beam('RakingFascia',(0,6.12,z),(1.84,4.55,z),.115,.13)
        B('GableCollar',(3.49,.10,.125),(0,4.65,z),trim,.014)
    arch('AtticFrame',0,4.94,1.923,.77,.86,.10,trim)
    arch('AtticGlass',0,5.035,1.989,.58,.66,.045,glass)
    B('AtticMullion',(.047,.61,.07),(0,5.365,2.026),trim,.010)
    B('AtticTransom',(.57,.047,.075),(0,5.38,2.031),trim,.010)
    B('AtticSill',(.93,.11,.25),(0,4.95,1.955),trim,.022)
    # A small, restrained king-post ornament under the apex.
    B('GablePendant',(.095,.26,.12),(0,5.83,2.003),trim,.018)
    sphere('GablePendantFinial',scale=(.072,.075,.047),
           loc=(0,5.69,2.028),mat=trim,parent=r)
    # Rear attic is deliberately simpler, avoiding a blank back elevation.
    window('RearAttic',0,5.15,-1.872,width=.49,height=.55,turn=math.pi,chunky=False)
    # Offset chimney intersects the sloping roof instead of floating above it.
    B('Chimney',(.45,1.12,.58),(.94,5.45,-.96),stone,.035)
    B('ChimneyBand',(.50,.13,.63),(.94,5.91,-.96),trim,.019)
    B('ChimneyCrown',(.57,.15,.68),(.94,6.04,-.96),roof,.026)
    B('ChimneyFlue',(.28,.032,.39),(.94,6.124,-.96),roof,.010)
    return r
