"""Export six independent SF parts, transparent thumbnails, and editable source."""
import sys, json, importlib, math
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE / 'batches' / 'sf')]
from common import *

OUT = HERE / 'output' / 'sf'
OUT.mkdir(parents=True, exist_ok=True)
SPECS = {
    'sourdough': {'size': [1.8, 1.25, 2.5], 'driverSeat': [0,.22,-.25], 'gadgetMount': [0,.2,-1.0]},
    'mission_burrito': {'size': [1.7,1.05,3.5], 'driverSeat': [0,.22,-.25], 'gadgetMount': [0,.15,-1.4]},
    'painted_porch': {'size': [2.2,2.3,2.9], 'driverSeat': [0,-.63,-.18], 'gadgetMount': [0,-.65,-1.2]},
    'skate': {'radius': .33, 'width': .24},
    'scooter': {'radius': .5, 'width': .27},
    'transit_disc': {'radius': .64, 'width': .30},
}

def optimized_export(source, name):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    export_root = root(name + '_runtime')
    groups = {}
    for original in source.children_recursive:
        if original.type != 'MESH': continue
        data = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph), depsgraph=depsgraph)
        duplicate = bpy.data.objects.new(original.name + '_export', data)
        bpy.context.collection.objects.link(duplicate)
        duplicate.matrix_world = original.matrix_world.copy()
        duplicate.parent = export_root
        key = tuple(m.name for m in data.materials)
        groups.setdefault(key, []).append(duplicate)
    for key, objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects: ob.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = name + '_' + '_'.join(key)
    export_glb(export_root, OUT / (name + '.glb'))
    tris = 0
    bounds = []
    for ob in export_root.children:
        if ob.type == 'MESH':
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
            bounds.extend(AXES.transposed() @ (ob.matrix_world @ v.co) for v in ob.data.vertices)
    result = {**SPECS[name], 'file': name+'.glb', 'bytes': (OUT/(name+'.glb')).stat().st_size,
              'triangles': tris, 'meshBatches': len(export_root.children),
              'materialBatches': sum(len(o.data.materials) for o in export_root.children if o.type == 'MESH'),
              'bounds': [[min(p[i] for p in bounds) for i in range(3)], [max(p[i] for p in bounds) for i in range(3)]]}
    for ob in [*export_root.children_recursive, export_root]: bpy.data.objects.remove(ob, do_unlink=True)
    return result

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
assets, manifest = {}, {}
for name in SPECS:
    module_path = HERE / 'batches' / 'sf' / (name + '.py')
    if not module_path.exists(): continue
    ob = getattr(importlib.import_module(name), 'build_'+name)()
    ob['asset_id'] = name
    assets[name] = ob
    manifest[name] = optimized_export(ob, name)
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for part in [ob, *ob.children_recursive]:
        for old in list(part.users_collection): old.objects.unlink(part)
        collection.objects.link(part)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.66,.73,1,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
scene.view_settings.view_transform = 'AgX'
def area(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size; d.color=color
    ob=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(ob)
    ob.location=point(loc); ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
area('Warm key',(-5,8,7),1100,6,(1,.86,.68))
area('Cool fill',(6,5,1),600,6,(.67,.80,1))
area('Soft rim',(0,7,-5),850,5,(1,.94,.82))
data=bpy.data.cameras.new('Isometric asset camera'); data.type='ORTHO'
camera=bpy.data.objects.new('Isometric asset camera',data); bpy.context.collection.objects.link(camera); scene.camera=camera
camera.location=point((6,4.8,7)); camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
for name, ob in assets.items():
    for other_name, other in assets.items():
        for part in [other,*other.children_recursive]: part.hide_render=(other_name!=name)
    data.ortho_scale = 4.6 if 'size' in SPECS[name] else SPECS[name]['radius']*3.25
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)

# Editable, labeled collection layout; presentation elements excluded from GLBs.
for index,(name,ob) in enumerate(assets.items()):
    for part in [ob,*ob.children_recursive]: part.hide_render=False
    row=0 if 'size' in SPECS[name] else 1
    col=list(SPECS).index(name)%3
    base = SPECS[name]['size'][1]/2 if row==0 else SPECS[name]['radius']
    game_location(ob, ((col-1)*4.5, base+.045, -2.3 if row==0 else 2.2))
stage=root('Presentation only')
floor=material('SF_Backdrop','#AAA7C9',.88)
plinth=material('SF_Plinth','#E0D9C9',.8)
box('Backdrop',(200,.12,200),(0,-.22,0),floor,stage,0)
for z in [-2.3,2.2]:
    for x in [-4.5,0,4.5]: box('Display pedestal',(3.9,.2,3.7),(x,-.06,z),plinth,stage,.08)
scene.render.film_transparent=False
scene.render.resolution_x=1800; scene.render.resolution_y=1050
data.ortho_scale=17
camera.location=point((10,14,18)); camera.rotation_euler=(point((0,1,0))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'sf-parts-study.png')
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sf-parts.blend'))
bpy.ops.render.render(write_still=True)
manifest['coordinates']='Game X right, Y up, +Z forward. Chassis center origin; wheel X axle. Three wheelbases: ±length*.62/.7/.9/2; lateral ±(width/2+.05). Source layout translations excluded from GLBs.'
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('SF_ASSETS_COMPLETE',json.dumps(manifest))
