"""Shared real-mesh builders. Public coordinates use game X-right/Y-up/Z-forward."""
import bpy
import math
from mathutils import Vector, Matrix, Euler

AXES = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))

def point(p):
    return AXES @ Vector(p)

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def material(name, hex_color, roughness=.55, metallic=0):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    c = int(hex_color.lstrip('#'), 16) if isinstance(hex_color, str) else hex_color
    rgb = tuple(linear(((c >> shift) & 255) / 255) for shift in (16, 8, 0))
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

def root(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = 'PLAIN_AXES'
    return obj

def finish(obj, name, mat, parent, bevel=0, segments=3, smooth=True):
    obj.name = name
    if mat is not None:
        obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.harden_normals = True
    if smooth and obj.type == 'MESH':
        for poly in obj.data.polygons:
            poly.use_smooth = True
        normal = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        normal.weight = 40
    return obj

def box(name, size, loc, mat, parent=None, bevel=.03, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(loc))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, min(bevel, min(size) * .45), segments)

def sphere(name, scale, loc, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=point(loc))
    obj = bpy.context.object
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, smooth=True)

def cylinder(name, radius, depth, loc, mat, parent=None, axis='Y', vertices=32, bevel=.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=point(loc))
    obj = bpy.context.object
    game_axis = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis]
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(point(game_axis))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, min(bevel, depth * .35, radius * .3))

def mesh(name, verts, faces, mat, parent=None, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([point(v) for v in verts], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    # Recalculate consistent outward normals before beveling and exporting.
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return finish(obj, name, mat, parent, bevel)

def curve_tube(name, points, radius, mat, parent=None):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 12
    data.bevel_depth = radius
    data.bevel_resolution = 3
    data.use_fill_caps = True
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = point(p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    data.materials.append(mat)
    # Native mesh makes the exported asset deterministic across glTF loaders.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object

def set_rotation(obj, euler_xyz_in_game):
    rot = AXES @ Euler(euler_xyz_in_game, 'XYZ').to_matrix() @ AXES.transposed()
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = rot.to_quaternion()

def select_tree(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = obj

def export_glb(obj, path):
    select_tree(obj)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_animations=False, export_extras=True,
        export_cameras=False, export_lights=False)

def game_location(obj, loc):
    obj.location = point(loc)
