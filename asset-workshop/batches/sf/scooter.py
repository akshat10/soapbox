"""Compact scooter wheel, game-X axle, .5 rolling radius and .27 tire width."""
from common import *


def _lathe(name, profile, mat, parent, segments=40):
    verts=[(x,r*math.cos(2*math.pi*i/segments),r*math.sin(2*math.pi*i/segments))
           for x,r in profile for i in range(segments)]
    faces=[(j*segments+i,j*segments+(i+1)%segments,
            ((j+1)%len(profile))*segments+(i+1)%segments,
            ((j+1)%len(profile))*segments+i)
           for j in range(len(profile)) for i in range(segments)]
    return mesh(name,verts,faces,mat,parent=parent)


def _spoke(name,side,angle,mat,parent):
    # Broad, slightly swept casting with a simple sculpted perimeter.
    shape=[(.065,-.022),(.211,-.045),(.292,-.030),
           (.292,.027),(.211,.054),(.065,.023)]
    verts=[]
    for x in [side*.093,side*.123]:
        for radial,tangent in shape:
            verts.append((x,radial*math.cos(angle)-tangent*math.sin(angle),
                          radial*math.sin(angle)+tangent*math.cos(angle)))
    n=len(shape)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=mesh(name,verts,faces,mat,parent=parent,bevel=.006)
    for modifier in obj.modifiers:
        if modifier.type=='BEVEL':
            modifier.segments=1
    return obj


def build_scooter():
    parent=root('ScooterWheel')
    rubber=material('DD_Rubber','#29373D',roughness=.87)
    cream=material('DD_Cream','#F3E6C8',roughness=.52)
    cobalt=material('SF_Cobalt','#316EA8',roughness=.52)
    metal=material('DD_Metal','#BAC3B9',roughness=.36,metallic=.38)
    player=material('PlayerColor','#DF6B55',roughness=.5)

    # Smooth, circular rolling surface: all rings are at or inside radius .5.
    # Rounded shoulders provide the familiar compact scooter tire silhouette.
    profile=[(-.101,.298),(-.128,.323),(-.135,.383),
             (-.122,.444),(-.083,.488),(0,.500),
             (.083,.488),(.122,.444),(.135,.383),
             (.128,.323),(.101,.298)]
    _lathe('Scooter_Rounded_Rubber',profile,rubber,parent,segments=48)

    # A single cobalt barrel shows through the five cream spokes on both faces.
    cylinder('Scooter_Cobalt_Recess',.304,.182,(0,0,0),cobalt,
             parent=parent,axis='X',vertices=40,bevel=0)
    for side in [-1,1]:
        _lathe('Scooter_Cream_Rim_%d'%side,
               [(side*.101,.274),(side*.121,.274),(side*.130,.291),
                (side*.128,.317),(side*.118,.330),(side*.101,.317)],
               cream,parent,segments=40)
        for i in range(5):
            _spoke('Scooter_Cast_Spoke_%d_%d'%(side,i),side,
                   2*math.pi*i/5+.19,cream,parent)
        # Small hub accent preserves team identity without coloring the tire.
        cylinder('Scooter_Hub_Collar_%d'%side,.104,.018,(side*.116,0,0),
                 metal,parent=parent,axis='X',vertices=24,bevel=.005)
        cylinder('Scooter_Player_Hub_%d'%side,.069,.009,(side*.127,0,0),
                 player,parent=parent,axis='X',vertices=24,bevel=.003)
        # A single central hexagonal fixing gives the hardware a clear purpose.
        cylinder('Scooter_Axle_Fixing_%d'%side,.025,.006,(side*.131,0,0),
                 cream,parent=parent,axis='X',vertices=6,bevel=.002)

    parent['asset_id']='scooter'
    parent['wheel_radius']=.5
    parent['tire_width']=.27
    parent['game_axle']='X'
    parent['player_material']='PlayerColor'
    return parent
