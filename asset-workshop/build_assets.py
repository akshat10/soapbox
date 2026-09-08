"""Build editable source models, optimized GLBs, and a small art-direction study."""
import sys
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import *
from toaster import build_toaster
from house import build_house
from wheel import build_wheel

OUT = HERE / 'output'
OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
assets = {'toast-malone': build_toaster(), 'painted-lady': build_house(), 'street-wheel': build_wheel()}

def optimized_export(source, name):
    """Evaluate bevels on copies, batching geometry into one mesh per material."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    export_root = root(name)
    groups = {}
    for original in source.children_recursive:
        if original.type != 'MESH':
            continue
        data = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph), depsgraph=depsgraph)
        duplicate = bpy.data.objects.new(original.name + '_export', data)
        bpy.context.collection.objects.link(duplicate)
        duplicate.matrix_world = original.matrix_world.copy()
        duplicate.parent = export_root
        key = tuple(m.name for m in data.materials)
        groups.setdefault(key, []).append(duplicate)
    for key, objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = name + '_' + '_'.join(key)
    export_glb(export_root, OUT / (name + '.glb'))
    triangles = sum(len(o.data.polygons) for o in export_root.children if o.type == 'MESH')
    count = len(export_root.children)
    for ob in [*export_root.children_recursive, export_root]:
        bpy.data.objects.remove(ob, do_unlink=True)
    return {'file': name + '.glb', 'bytes': (OUT / (name + '.glb')).stat().st_size,
            'materialBatches': count, 'evaluatedPolygons': triangles}

manifest = {name: optimized_export(ob, name) for name, ob in assets.items()}
manifest['coordinates'] = 'Y-up, +Z forward; toaster centered on chassis; wheel rotates around X; house origin on ground'
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

# Originals retain individually named components and live bevel modifiers.
for name, ob in assets.items():
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for part in [ob, *ob.children_recursive]:
        for old in list(part.users_collection):
            old.objects.unlink(part)
        collection.objects.link(part)

toaster, house, wheel = assets.values()
game_location(house, (1.15, .02, -.5))
game_location(toaster, (-2.7, 1.15, 2.15))
game_location(wheel, (-3.655, .52, 2.955))
for x,z in [(-3.655,1.345), (-1.745,1.345), (-1.745,2.955)]:
    copy = wheel.copy()
    bpy.context.collection.objects.link(copy)
    copy.name = 'Study wheel'
    game_location(copy, (x,.52,z))
    for child in wheel.children_recursive:
        child_copy = child.copy()
        child_copy.data = child.data
        bpy.context.collection.objects.link(child_copy)
        child_copy.parent = copy

stage = root('Presentation — excluded from every GLB')
lavender = material('StudyBackdrop', '#AAA7C9', .86)
pavement = material('StudyPavement', '#D8CEB5', .78)
asphalt = material('StudyAsphalt', '#66798B', .80)
cream = material('StudyMarkings', '#F3E6C8', .78)
box('Diorama base', (9.5,.34,8.5), (0,-.20,0), pavement, stage, .12)
box('Road', (9.42,.075,2.85), (0,.005,2.36), asphalt, stage, .025)
box('Raised pavement', (9.42,.14,4.1), (0,.015,-1.20), pavement, stage, .025)
for x in [-3.3,-1.1,1.1,3.3]:
    box('Road dash', (.8,.014,.055), (x,.051,3.13), cream, stage, .012)
box('Backdrop', (200,.1,200), (0,-.43,0), lavender, stage, .0)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.66,.73,1,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
scene.view_settings.view_transform = 'AgX'

def area(name, loc, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.location = point(loc)
    ob.rotation_euler = (point((0,2,0))-ob.location).to_track_quat('-Z','Y').to_euler()
    return ob

area('Warm large key', (-6,11,6), 1900, 7, (1,.86,.66))
area('Cool fill', (7,7,1), 850, 8, (.65,.79,1))
area('Roof rim', (1,10,-7), 1500, 6, (1,.94,.80))
camera_data = bpy.data.cameras.new('Isometric study camera')
camera = bpy.data.objects.new('Isometric study camera', camera_data)
bpy.context.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 13.6
camera.location = point((12,11,16))
camera.rotation_euler = (point((0,2.1,0))-camera.location).to_track_quat('-Z','Y').to_euler()

# Open the editable file at the composed camera angle, in material preview.
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            a.spaces.active.region_3d.view_perspective = 'CAMERA'
            a.spaces.active.shading.type = 'MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
house.select_set(True)
bpy.context.view_layer.objects.active = house
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'doodle-derby-study.blend'))
scene.render.filepath = str(OUT / 'doodle-derby-study.png')
bpy.ops.render.render(write_still=True)
print('ASSET_BUILD_COMPLETE', json.dumps(manifest))
