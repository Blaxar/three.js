/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import {
	BufferGeometry,
	FileLoader,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineSegments,
	Loader,
	Material,
	Mesh,
	Points,
	PointsMaterial,
  Vector2,  
	Vector3,
  Face3,  
  Matrix4,
  Vector4,
  MathUtils,
  BoxBufferGeometry,
  MeshBasicMaterial,
  Geometry,
  SphereGeometry,
  Quaternion,
  Plane,
  Shape,
  ShapeGeometry
} from "../../../build/three.module.js";

const LightSampling = {
  FACET: 1,
  VERTEX: 2
}

const GeometrySampling = {
  POINTCOULD: 1,
  WIREFRAME: 2,
  SOLID: 3
}

const TextureMode = {
  LIT: 1,
  FORESHORTEN: 2,
  FILTER: 3
}

const MaterialMode = {
  NONE: 0,
  NULL: 1,
  DOUBLE: 2
}

var triangulateKFacesWithShapes = (function () {
  // Mostly crediting @neeh for their answer: https://stackoverflow.com/a/42402681
  var _ctr = new Vector3();

  var _plane = new Plane();
  var _q = new Quaternion();
  var _y = new Vector3();
  var _x = new Vector3();

  var X = new Vector3(1.0, 0.0, 0.0);
  var Y = new Vector3(0.0, 1.0, 0.0);
  var Z = new Vector3(0.0, 0.0, 1.0);
 
  var _tmp = new Vector3();

  var _basis = new Matrix4();

    return function (vertices, uvs, loops, loop_signatures = []) {

    let new_vertices = [];
    let new_uvs = [];
    let faces = [];

    let offset = vertices.length;  

    for (let lid = 0, llen = loops.length; lid < llen; lid++) {

      let loop = loops[lid];

      // compute centroid
      _ctr.setScalar(0.0);

      let l = loop.length;
      for (let i = 0; i < l; i++) {
        _ctr.add(vertices[loop[i]]);
      }
      _ctr.multiplyScalar(1.0 / l);

      let loop_normal = new Vector3(0.0, 0.0, 0.0);

      // compute loop normal using Newell's Method
      for (let i = 0, len = loop.length; i < len; i++) { 
        let current_vertex = vertices[loop[i]];
        let next_vertex = vertices[loop[(i + 1) % len]];

        loop_normal.x += (current_vertex.y - next_vertex.y) * (current_vertex.z + next_vertex.z);
        loop_normal.y += (current_vertex.z - next_vertex.z) * (current_vertex.x + next_vertex.x);
        loop_normal.z += (current_vertex.x - next_vertex.x) * (current_vertex.y + next_vertex.y);
      }

      loop_normal.normalize();

      _plane.setFromNormalAndCoplanarPoint(loop_normal, vertices[loop[0]]);
      let _z = _plane.normal;

      // compute basis
      _q.setFromUnitVectors(Z, _z);
      _x.copy(X).applyQuaternion(_q);
      _y.crossVectors(_x, _z);
      _y.normalize();
      _basis.makeBasis(_x, _y, _z);
      _basis.setPosition(_ctr);

      // project the 3D vertices on the 2D plane
      let projVertices = [];
      for (let i = 0; i < l; i++) {
        _tmp.subVectors(vertices[loop[i]], _ctr);
        projVertices.push(new Vector2(_tmp.dot(_x), _tmp.dot(_y)));
        new_uvs.push([uvs[loop[i]].u, uvs[loop[i]].v]);
      }

      // create the geometry (Three.js triangulation with ShapeBufferGeometry)
      let shape = new Shape(projVertices);
      let geometry = new ShapeGeometry(shape);

      // transform geometry back to the initial coordinate system
      geometry.applyMatrix4(_basis);

      for (let i = 0, l_vertices = geometry.vertices.length; i < l_vertices; i++) {
        new_vertices.push(geometry.vertices[i]);
      }

      for (let i = 0, l_faces = geometry.faces.length; i < l_faces; i++) {
        let face = new Face3(geometry.faces[i].a + offset,
                             geometry.faces[i].b + offset,
                             geometry.faces[i].c + offset);
        face.materialIndex = loop_signatures[lid];
        faces.push(face);
      }

      offset += geometry.vertices.length;

    }

    return [new_vertices, new_vertices, faces];
  };
})();

var RwxState = ( function () {

  function RwxState() {
    // Material related properties start here
    this.color = 0x000000; // Red, Green, Blue
    this.surface = [0.0, 0.0, 0.0]; // Ambience, Diffusion, Specularity
    this.opacity = 1.0;
    this.lightsampling = LightSampling.FACET;
    this.geometrysampling = GeometrySampling.SOLID;
    this.texturemodes = [TextureMode.LIT,]; // There's possibly more than one mode enabled at a time (hence why we use an array)
    this.materialmode = MaterialMode.NONE; // Neither NULL nor DOUBLE: we only render one side of the polygon
    this.texture = null;
    this.mask = null;
    // End of material related properties

    this.transform = new Matrix4();
  }

  RwxState.prototype = {

    constructor: RwxState,

    get_mat_signature : function () {
      let sign = this.color[0].toFixed(3) + this.color[1].toFixed(3) + this.color[2].toFixed(3);
      sign += this.surface[0].toFixed(3) + this.surface[1].toFixed(3) + this.surface[2].toFixed(3);
      sign += this.opacity.toFixed(3);
      sign += this.lightsampling.toString() + this.geometrysampling.toString()
      this.texturemodes.forEach((tm) => {
        sign += tm.toString();
      });
      sign += this.materialmode.toString();

      // TODO: handle textures

      return sign;
    }

  };

  return RwxState;

} ) ();

var RwxVertex = ( function () {

  function RwxVertex( x, y, z, u = null, v = null ) {

    this.x = x;
    this.y = y;
    this.z = z;
    this.u = u;
    this.v = v;

  }

  RwxVertex.prototype = {

    constructor: RwxVertex

  };

  return RwxVertex;

} ) ();

var RwxShape = ( function () {

  function RwxShape( state = null ) {

    this.state = new RwxState();
    if (state != null) {
      Object.assign(this.state, state);
    }
    this.vertices_id = [];

  }

  RwxShape.prototype = {

    constructor: RwxShape,

  };

  return RwxShape;

} ) ();

var RwxTriangle = ( function () {

  function RwxTriangle( v1, v2, v3, state = new RwxState() ) {

    RwxShape.call(this, state);
    this.vertices_id = [v1, v2, v3];

  }

  RwxTriangle.prototype = Object.assign( Object.create( RwxShape.prototype ), {

    constructor: RwxTriangle,

    as_triangles: function ( offset = 0 ) {

      if (offset)
      {
        return [new RwxTriangle(this.vertices_id[0] + offset,
                                this.vertices_id[1] + offset,
                                this.vertices_id[2] + offset,
                                this.state)];
      }
      else
      {
        return [this];
      }

    },

    as_face3: function ( offset = 0 ) {

        return new Face3(this.vertices_id[0] + offset,
                         this.vertices_id[1] + offset,
                         this.vertices_id[2] + offset);

    }

  });

  return RwxTriangle; 

} ) ();

var RwxQuad = ( function () {

  function RwxQuad( v1, v2, v3, v4, state = new RwxState() ) {

    RwxShape.call(this, state);
    this.vertices_id = [v1, v2, v3, v4];

  }

  RwxQuad.prototype = Object.assign( Object.create( RwxShape.prototype ), {

    constructor: RwxQuad,

    as_triangles: function ( offset = 0 ) {

      return [new RwxTriangle(this.vertices_id[0] + offset,
                              this.vertices_id[1] + offset,
                              this.vertices_id[2] + offset,
                              this.state),
              new RwxTriangle(this.vertices_id[0] + offset,
                              this.vertices_id[2] + offset,
                              this.vertices_id[3] + offset,
                              this.state)];

    }

  });

  return RwxQuad;

} ) ();

var RwxPolygon = ( function () {

  function RwxPolygon( vertices_id, state = new RwxState() ) {

    RwxShape.call(this, state);
    this.vertices_id = vertices_id;

    if(this.vertices_id[0] == this.vertices_id.slice(-1)[0])
      this.vertices_id.splice(-1, 1);

  }

  RwxPolygon.prototype = Object.assign( Object.create( RwxShape.prototype ), {

    constructor: RwxPolygon,

    as_loop: function ( offset = 0 ) {

      if (offset)
      {
        let loop = [];
        this.vertice_id.forEach((id) => {
          loop.push(id + offset);
        });
        return loop;
      }
      else
      {
        return this.vertices_id;
      }
    }

  });

  return RwxPolygon; 

} ) ();

var RwxScope = ( function () {

  function RwxScope( state = null ) {

    this.state = new RwxState();
    if (state != null) {
      Object.assign(this.state, state);
    }
    this.vertices = [];
    this.shapes = [];

  }

  RwxScope.prototype = {

    constructor: RwxScope,

    get_triangles: function ( offset = 0 ) {
      let faces = [];
      this.shapes.forEach((shape) => {
        if (typeof shape.as_triangles === 'function') { 
          faces.push(...shape.as_triangles(offset));
        }
      });

      return faces;
    },

    get_polys: function () {
      let polys = [];
      this.shapes.forEach((shape) => {
        if (typeof shape.as_loop === 'function') {
          polys.push(shape);
        }
      });

      return polys;
    },

  };

  return RwxScope;

} ) ();

var RwxClump = ( function () {

  function RwxClump( state = new RwxState() ) {

    RwxScope.call(this, state);
    this.clumps = [];

  }

  RwxClump.prototype = Object.assign( Object.create( RwxScope.prototype ), {

    constructor: RwxClump,

    apply_proto: function (proto) {
      let offset = this.vertices.length;

      let shapes = [];
      if (proto.shapes != null) {
        Object.assign(shapes, proto.shapes);
      }

      shapes.forEach( (shape) => {
        for (let i=0; i < shape.vertices_id.length; i++) {
          shape.vertices_id[i] += offset;
        }
      });

      this.shapes.push(...shapes);

      proto.vertices.forEach( (vert) => {
        let mat = proto.state.transform.clone(); 
        let vec4 = new Vector4(vert.x, vert.y, vert.z, 1);
        vec4.applyMatrix4(mat);
        this.vertices.push(new RwxVertex(vec4.x, vec4.y, vec4.z, vert.u, vert.v));
      });
    }

  });

  return RwxClump; 

} ) ();

var RwxObject = ( function () {

  function RwxObject() {

      this.protos = [];
      this.clumps = [];
      this.state = new RwxState();

  }

  RwxObject.prototype = {

    constructor: RwxObject

  };

  return RwxObject;

} ) ();

var gather_vertices_recursive = function( clump ) {

  let vertices = [];
  let uvs = [];  
  let transform = clump.state.transform;

  clump.vertices.forEach( (v) => {
    let vert = (new Vector4(v.x, v.y, v.z, 1)).applyMatrix4(transform);
    vertices.push(new Vector3(vert.x, vert.y, vert.z));
    uvs.push([v.u, v.v]);
  });

  clump.clumps.forEach( (c) => {
    let [tmp_vertices, tmp_uvs] = gather_vertices_recursive(c);    
    vertices.push(...tmp_vertices);
    uvs.push(...tmp_uvs);
  });

  return [vertices, uvs];

}

var gather_faces_recursive = function(clump, materials_map = {}, offset = 0) {

  let faces = [];
  let tmp_faces = [];
  let loops = [];
  let loop_signatures = [];
  let poly_signatures = [];
  let tmp_loops = [];
  let tmp_loop_signatures = [];
  let tmp_triangles = clump.get_triangles(offset);
  let tmp_polys = clump.get_polys();

  tmp_triangles.forEach((tmp_triangle) => {
    let face = tmp_triangle.as_face3();
    face.materialIndex = materials_map[tmp_triangle.state.get_mat_signature()];
    faces.push(face);
  });

  tmp_polys.forEach((tmp_poly) => {
    let loop = [];
    tmp_poly.as_loop().forEach((vertice_id) => {
      loop.push(vertice_id + offset);
    });
    loops.push(loop);
    loop_signatures.push(materials_map[tmp_poly.state.get_mat_signature()]);  
  });

  offset += clump.vertices.length;

  clump.clumps.forEach((c) => { 
    [tmp_faces, tmp_loops, tmp_loop_signatures, offset] = gather_faces_recursive(c, materials_map, offset);
    faces.push(...tmp_faces);
    loops.push(...tmp_loops);
    loop_signatures.push(...tmp_loop_signatures);
  });

  return [faces, loops, loop_signatures, offset];

}

var make_materials_recursive = function(clump, folder = ".", materials_map = {}, tex_extension = "jpg", mask_extension = "zip"){

  clump.shapes.forEach((shape) => {
    let mat_sign = shape.state.get_mat_signature();

    if (materials_map[mat_sign] === undefined)
    {
      let material_color = (Math.trunc(shape.state.color[0] * 255) << 16) + (Math.trunc(shape.state.color[1] * 255) << 8) + Math.trunc(shape.state.color[2] * 255);
      // TODO: create material from actual parsed properties
      materials_map[mat_sign] = new MeshBasicMaterial({color: material_color });
    }
  });

  clump.clumps.forEach((sub_clump) => {
    materials_map = Object.assign({}, materials_map,
      make_materials_recursive(sub_clump, folder, materials_map, tex_extension, mask_extension));
  });

  return materials_map;

}

var RWXLoader = ( function () {

  function RWXLoader( manager ) {

		Loader.call( this, manager );

		this.materials = null;

    this.integer_regex = new RegExp("([-+]?[0-9]+)", 'g');
    this.float_regex = new RegExp("([+-]?([0-9]+([.][0-9]*)?|[.][0-9]+))", 'g');
    this.non_comment_regex = new RegExp("^(.*)#", 'g');
    this.modelbegin_regex = new RegExp("^ *(modelbegin).*$", 'i');
    this.modelend_regex = new RegExp("^ *(modelend).*$", 'i');
    this.clumpbegin_regex = new RegExp("^ *(clumpbegin).*$", 'i');
    this.clumpend_regex = new RegExp("^ *(clumpend).*$", 'i');
    this.protobegin_regex = new RegExp("^ *(protobegin) +([A-Za-z0-9_\\-]+).*$", 'i');
    this.protoinstance_regex = new RegExp("^ *(protoinstance) +([A-Za-z0-9_\\-]+).*$", 'i');
    this.protoend_regex = new RegExp("^ *(protoend).*$", 'i');
    this.vertex_regex = new RegExp("^ *(vertex|vertexext)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}) *(uv(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){2}))?.*$", 'i');
    this.polygon_regex = new RegExp("^ *(polygon|polygonext)( +[0-9]+)(( +[0-9]+)+) ?.*$", 'i');
    this.quad_regex = new RegExp("^ *(quad|quadext)(( +([0-9]+)){4}).*$", 'i');
    this.triangle_regex = new RegExp("^ *(triangle|triangleext)(( +([0-9]+)){3}).*$", 'i');
    this.texture_regex = new RegExp("^ *(texture) +([A-Za-z0-9_\\-]+) *(mask *([A-Za-z0-9_\\-]+))?.*$", 'i');
    this.color_regex = new RegExp("^ *(color)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$", 'i');
    this.opacity_regex = new RegExp("^ *(opacity)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$", 'i');
    this.transform_regex = new RegExp("^ *(transform)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){16}).*$", 'i');
    this.scale_regex = new RegExp("^ *(scale)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$", 'i');
    this.rotate_regex = new RegExp("^ *(rotate)(( +[-+]?[0-9]*){4})$", 'i');
    this.surface_regex = new RegExp("^ *(surface)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$", 'i');
    this.ambient_regex = new RegExp("^ *(ambient)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$", 'i');
    this.diffuse_regex = new RegExp("^ *(diffuse)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$", 'i');
    this.specular_regex = new RegExp("^ *(specular)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$", 'i');

	}

  RWXLoader.prototype = Object.assign( Object.create( Loader.prototype ), {

		constructor: RWXLoader,

    load: function ( url, onLoad, onProgress, onError ) {

			var scope = this;

			var loader = new FileLoader( this.manager );
			loader.setPath( this.path );
			loader.setRequestHeader( this.requestHeader );
			loader.setWithCredentials( this.withCredentials );
			loader.load( url, function ( text ) {

        try {

          onLoad( scope.parse( text ) );

			  } catch ( e ) {

          if ( onError ) {

				  	onError( e );

			    } else {

					  console.error( e );

				  }

				  scope.manager.itemError( url );

			  }

			}, onProgress, onError );

		},

    parse: function ( str ) {

	    var vA = new Vector3();
	    var vB = new Vector3();
	    var vC = new Vector3();

	    var ab = new Vector3();
	    var cb = new Vector3();   

      // Parsing RWX file content

      const default_surface = [0.0, 0.0, 0.0];

      let rwx_clump_stack = [];
      let rwx_proto_dict = {};
      let current_scope = null;

      const lines = str.split( /[\n\r]+/g );

      for ( let i = 0, l = lines.length; i < l; i ++ ) {
        let line = lines[i];

        // strip comment away (if any)    
        let res = this.non_comment_regex.exec(line);
        if (res != null) {
          line = res[1];
        }

        // replace tabs with spaces
        line = line.trim().replace('\t', ' ');

        res = this.modelbegin_regex.exec(line);
        if (res != null) {
          rwx_clump_stack.push(new RwxObject());
          current_scope = rwx_clump_stack.slice(-1)[0];
          current_scope.state.surface = default_surface;
          continue;
        }

        res = this.clumpbegin_regex.exec(line);
        if (res != null) {
          let rwx_clump = new RwxClump(state = current_scope.state)
          rwx_clump_stack.slice(-1)[0].clumps.push(rwx_clump);
          rwx_clump_stack.push(rwx_clump);
          current_scope = rwx_clump;
          continue;
        }

        res = this.clumpend_regex.exec(line);
        if (res != null) {
          rwx_clump_stack.pop();
          current_scope = rwx_clump_stack.slice(-1)[0];
          continue;
        }

        res = this.protobegin_regex.exec(line);
        if (res != null) {
          let name = res[2];
          rwx_proto_dict[name] = new RwxScope(state = current_scope.state);
          current_scope = rwx_proto_dict[name];
          continue;
        }

        res = this.protoend_regex.exec(line);
        if (res != null) {
          current_scope = rwx_clump_stack[0];
          continue;
        }

        res = this.protoinstance_regex.exec(line);
        if (res != null) {
          name = res[2];
          current_scope.apply_proto(rwx_proto_dict[name]);
          continue;
        }

        res = this.texture_regex.exec(line);
        if (res != null) {
          if (res[2].toLowerCase() == "null") {
            current_scope.state.texture = null;
          } else {
            current_scope.state.texture = res[2];
          }
          current_scope.state.mask = res[4];
          continue;
        }

        res = this.triangle_regex.exec(line);
        if (res != null) {
          let v_id = [];
          res[2].match(this.integer_regex).forEach( (entry) => {
            v_id.push(parseInt(entry)-1);
          });
          current_scope.shapes.push(new RwxTriangle(v_id[0], v_id[1], v_id[2],
                                                    state=current_scope.state));
          continue;
        }

        res = this.quad_regex.exec(line);
        if (res != null) {
          let v_id = [];
          res[2].match(this.integer_regex).forEach( (entry) => {
            v_id.push(parseInt(entry)-1);
          });
          current_scope.shapes.push(new RwxQuad(v_id[0], v_id[1], v_id[2], v_id[3],
                                                state=current_scope.state));
          continue;
        }

        res = this.polygon_regex.exec(line);
        if (res != null) {
          let v_len = parseInt(res[2].match(this.integer_regex)[0]);
          let v_id = [];
          res[3].match(this.integer_regex).forEach( (id) => {
            v_id.unshift(parseInt(id)-1);
          });
          current_scope.shapes.push(new RwxPolygon(v_id.slice(0, v_len),
                                                   state=current_scope.state));
          continue;
        }

        res = this.vertex_regex.exec(line);
        if (res != null) {
          let vprops = [];
          res[2].match(this.float_regex).forEach( (x) => {
            vprops.push(parseFloat(x));
          });

          if (typeof(res[7]) != "undefined") {
            let more_vprops = [];
            res[7].match(this.float_regex).forEach( (x) => {
              more_vprops.push(parseFloat(x));
            });

            current_scope.vertices.push(new RwxVertex(vprops[0], vprops[1], vprops[2],
                                                      more_vprops[0], vprops[1]));
          } else {

            current_scope.vertices.push(new RwxVertex(vprops[0], vprops[1], vprops[2]));

          }
          continue;
        }

        res = this.color_regex.exec(line);
        if (res != null) {
          let cprops = [];
          res[2].match(this.float_regex).forEach( (x) => {
            cprops.push(parseFloat(x));
          });

          if (cprops.length == 3) {
            current_scope.state.color = cprops;
          }

          continue;
        }

        res = this.opacity_regex.exec(line);
        if (res != null) {
          current_scope.state.opacity = parseFloat(res[2]);
          continue;
        }

        res = this.transform_regex.exec(line);
        if (res != null) {
          let tprops = [];
          res[2].match(this.float_regex).forEach( (x) => {
            tprops.push(parseFloat(x));
          });

          if (tprops.length == 16) {
            current_scope.state.transform = new Matrix4();
            current_scope.state.transform.fromArray(tprops);  
          }
          continue;
        }

        res = this.rotate_regex.exec(line);
        if (res != null) {
          let rprops = []; 
          res[2].match(this.integer_regex).forEach( (x) => {
            rprops.push(parseInt(x));
          });

          if (rprops.length == 4) {
            let rotate_m = new Matrix4();

            if (rprops[0]) {
              current_scope.state.transform =
                rotate_m.makeRotationX(MathUtils.degToRad(-rprops[3])).multiply(current_scope.state.transform);
            }
            if (rprops[1]) {
              current_scope.state.transform =
                rotate_m.makeRotationY(MathUtils.degToRad(-rprops[3])).multiply(current_scope.state.transform);
            }
            if (rprops[2]) {
              current_scope.state.transform =
                rotate_m.makeRotationZ(MathUtils.degToRad(-rprops[3])).multiply(current_scope.state.transform);
            }
          }

          continue;
        }

        res = this.scale_regex.exec(line);
        if (res != null) {
          let sprops = [];
          res[2].match(this.float_regex).forEach( (x) => {
            sprops.push(parseFloat(x));
          });

          if (sprops.length == 3) {
            let scale_m = new Matrix4();

            current_scope.state.transform =
              scale_m.makeScale(sprops[0], sprops[1], sprops[2]).multiply(current_scope.state.transform);
          }
          continue;
        }

        res = this.surface_regex.exec(line);
        if (res != null) {
          let sprops = [];
          res[2].match(this.float_regex).forEach( (x) => {
            sprops.push(parseFloat(x));
          });

          current_scope.state.surface = sprops;
          continue;
        }

        res = this.ambient_regex.exec(line);
        if (res != null) {
          let surf = current_scope.state.surface;
          current_scope.state.surface[0] = parseFloat(res[2]);
          continue;
        }

        res = this.diffuse_regex.exec(line);
        if (res != null) {
          let surf = current_scope.state.surface;
          current_scope.state.surface[1] = parseFloat(res[2]);
          continue;
        }

        res = this.specular_regex.exec(line);
        if (res != null) {
          let surf = current_scope.state.surface;
          current_scope.state.surface[2] = parseFloat(res[2]);
          continue;
        }
      }

      var state = {
			  object: {},

		  	vertices: [],
			  normals: [],
		  	colors: [],
		  	uvs: [],

			  materials: {},
		  	materialLibraries: [],
		  };

      var scene = new Group();

      let geometry = new Geometry();

      let [vertices, uvs] = gather_vertices_recursive(rwx_clump_stack[0].clumps[0]); 

      geometry.vertices.push(...vertices);

      let materials_map = make_materials_recursive(rwx_clump_stack[0].clumps[0]);

      let materials_list = [];

      // make a material list
      let i = 0;  
      Object.keys(materials_map).forEach((key) => {
        materials_list.push(materials_map[key]);

        // replace map entries with corresponding ids in material_list
        materials_map[key] = i++;  
      });

      geometry.materials = materials_list;

      let [faces, loops, loop_signatures, offset] = gather_faces_recursive(rwx_clump_stack[0].clumps[0], materials_map)
      geometry.faces.push(...faces);

      let [new_vertices, new_uvs, new_faces] = triangulateKFacesWithShapes(geometry.vertices, uvs, loops, loop_signatures);
      geometry.vertices.push(...new_vertices);
      geometry.faces.push(...new_faces);
      uvs.push(...new_uvs);

      geometry.faceVertexUvs[0] = [];

      for (let i = 0; i < geometry.faces.length ; i++) {
        let vid1 = geometry.faces[i].a;
        let vid2 = geometry.faces[i].b;
        let vid3 = geometry.faces[i].c;

        geometry.faceVertexUvs[0].push([
          new Vector2(uvs[vid1][0], uvs[vid1][1]),
          new Vector2(uvs[vid2][0], uvs[vid2][1]),
          new Vector2(uvs[vid3][0], uvs[vid3][1])
        ]);
      }

      geometry.uvsNeedUpdate = true;

      const object = new Mesh( geometry, materials_list);

      scene.add(object);

      return scene;
    }
  });

	return RWXLoader;

} )();

export { RWXLoader };
