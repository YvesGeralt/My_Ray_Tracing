#version 330 core
out vec4 FragColor;

in vec2 TexCoords;

uniform vec3 cameraPos;
uniform vec3 cameraFront;
uniform vec3 cameraUp;
uniform float time;

// 材质定义
struct Material {
    int type;            // 0: 漫反射, 1: 金属(反射), 2: 玻璃(折射)
    vec3 albedo;         // 反照率/颜色
    float roughness;     // 粗糙度
    float refractiveIndex; // 折射率 (玻璃材质使用)
};

// Stanford Bunny模型数据
const int MAX_TRIANGLES = 30000;
uniform int numTriangles;
uniform vec3 triVertices[MAX_TRIANGLES];
uniform Material bunnyMaterial;

// 球体定义
struct Sphere {
    vec3 center;
    float radius;
    Material material;
};

const int MAX_SPHERES = 10;
uniform int numSpheres;
uniform Sphere spheres[MAX_SPHERES];

// 光源
uniform vec3 lightPos = vec3(10.0, 10.0, 10.0);
uniform vec3 lightColor = vec3(1.0, 1.0, 1.0);
uniform float ambientStrength = 0.3;

// 设置最大反弹次数
const int MAX_BOUNCES = 3;

// 光线结构
struct Ray {
    vec3 origin;
    vec3 dir;
};

// 相交点信息
struct HitInfo {
    bool hit;
    float t;
    vec3 point;
    vec3 normal;
    Material material;
};

// 随机数生成 (基于哈希)
float random(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 球体-光线相交测试
bool intersectSphere(Ray ray, Sphere sphere, out float t, out vec3 hitPoint, out vec3 normal) {
    vec3 oc = ray.origin - sphere.center;
    float a = dot(ray.dir, ray.dir);
    float b = 2.0 * dot(oc, ray.dir);
    float c = dot(oc, oc) - sphere.radius * sphere.radius;
    float discriminant = b * b - 4.0 * a * c;
    
    if (discriminant < 0.0) {
        return false;
    }
    
    float temp = (-b - sqrt(discriminant)) / (2.0 * a);
    if (temp < 0.001) {
        temp = (-b + sqrt(discriminant)) / (2.0 * a);
        if (temp < 0.001) {
            return false;
        }
    }
    
    t = temp;
    hitPoint = ray.origin + ray.dir * t;
    normal = normalize(hitPoint - sphere.center);
    return true;
}

// 三角形-光线相交测试
bool intersectTriangle(Ray ray, vec3 v0, vec3 v1, vec3 v2, out float t, out vec3 normal) {
    const float EPSILON = 0.0001;
    vec3 edge1 = v1 - v0;
    vec3 edge2 = v2 - v0;
    vec3 h = cross(ray.dir, edge2);
    float a = dot(edge1, h);
    
    if (abs(a) < EPSILON) {
        return false;
    }
    
    float f = 1.0 / a;
    vec3 s = ray.origin - v0;
    float u = f * dot(s, h);
    
    if (u < 0.0 || u > 1.0) {
        return false;
    }
    
    vec3 q = cross(s, edge1);
    float v = f * dot(ray.dir, q);
    
    if (v < 0.0 || u + v > 1.0) {
        return false;
    }
    
    float tempT = f * dot(edge2, q);
    if (tempT > EPSILON) {
        t = tempT;
        normal = normalize(cross(edge1, edge2));
        return true;
    }
    
    return false;
}

// 场景-光线相交测试 (返回最近的交点)
HitInfo intersectScene(Ray ray) {
    HitInfo result;
    result.hit = false;
    result.t = 1e20;
    
    // 检查与所有球体的相交
    for (int i = 0; i < numSpheres; i++) {
        float t;
        vec3 hitPoint;
        vec3 normal;
        
        if (intersectSphere(ray, spheres[i], t, hitPoint, normal)) {
            if (t < result.t) {
                result.hit = true;
                result.t = t;
                result.point = hitPoint;
                result.normal = normal;
                result.material = spheres[i].material;
            }
        }
    }
    
    // 检查与Stanford Bunny的所有三角形的相交
    for (int i = 0; i < numTriangles; i += 3) {
        float t;
        vec3 normal;
        
        if (intersectTriangle(ray, triVertices[i], triVertices[i+1], triVertices[i+2], t, normal)) {
            if (t < result.t) {
                result.hit = true;
                result.t = t;
                result.point = ray.origin + ray.dir * t;
                result.normal = normal;
                result.material = bunnyMaterial;
            }
        }
    }
    
    return result;
}

// 反射函数
vec3 reflect(vec3 incident, vec3 normal) {
    return incident - 2.0 * dot(incident, normal) * normal;
}

// 折射函数 (使用斯涅尔定律)
vec3 refract(vec3 incident, vec3 normal, float eta) {
    float cosTheta = min(dot(-incident, normal), 1.0);
    vec3 r_perp = eta * (incident + cosTheta * normal);
    vec3 r_para = -sqrt(1.0 - dot(r_perp, r_perp)) * normal;
    return r_perp + r_para;
}

// 菲涅尔方程 (Schlick近似)
float schlick(float cosine, float refIdx) {
    float r0 = (1.0 - refIdx) / (1.0 + refIdx);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * pow((1.0 - cosine), 5.0);
}

// 背景采样函数
vec3 sampleBackground(vec3 direction) {
    // 简单的天空渐变
    float t = 0.5 * (direction.y + 1.0);
    return mix(vec3(1.0), vec3(0.5, 0.7, 1.0), t);
}

// 检查阴影
bool inShadow(vec3 point, vec3 lightDir) {
    Ray shadowRay;
    shadowRay.origin = point + 0.001 * lightDir; // 避免自相交
    shadowRay.dir = lightDir;
    
    HitInfo shadowHit = intersectScene(shadowRay);
    return shadowHit.hit;
}

// 主要着色函数
vec3 shade(HitInfo hit, vec3 viewDir) {
    vec3 lightDir = normalize(lightPos - hit.point);
    float diff = max(dot(hit.normal, lightDir), 0.0);
    vec3 diffuse = diff * hit.material.albedo * lightColor;
    vec3 ambient = ambientStrength * hit.material.albedo;
    
    // 检查是否在阴影中
    if (inShadow(hit.point, lightDir)) {
        return ambient;
    }
    
    return ambient + diffuse;
}

void main() {
    // 计算视图矩阵 (从相机参数)
    vec3 right = normalize(cross(cameraFront, cameraUp));
    vec3 up = normalize(cross(right, cameraFront));
    mat4 view = mat4(
        vec4(right, 0.0),
        vec4(up, 0.0),
        vec4(-cameraFront, 0.0),
        vec4(0.0, 0.0, 0.0, 1.0)
    );
    
    // 构建透视投影矩阵
    float aspect = 16.0/9.0; // 或者使用uniform传递
    float fov = 45.0;
    float near = 0.1;
    float far = 100.0;
    float tanHalfFovy = tan(radians(fov) / 2.0);
    mat4 projection = mat4(0.0);
    projection[0][0] = 1.0 / (aspect * tanHalfFovy);
    projection[1][1] = 1.0 / tanHalfFovy;
    projection[2][2] = -(far + near) / (far - near);
    projection[2][3] = -1.0;
    projection[3][2] = -(2.0 * far * near) / (far - near);
    
    // 计算光线方向
    vec2 ndc = TexCoords * 2.0 - 1.0;
    vec4 clip = vec4(ndc, -1.0, 1.0);
    vec4 viewSpace = inverse(projection) * clip;
    viewSpace = vec4(viewSpace.xyz / viewSpace.w, 0.0);
    vec3 worldDir = normalize((inverse(view) * viewSpace).xyz);
    
    // 主光线
    Ray primaryRay;
    primaryRay.origin = cameraPos;
    primaryRay.dir = worldDir;
    
    // 实现迭代光线追踪 (替代递归)
    vec3 finalColor = vec3(0.0);
    vec3 throughput = vec3(1.0);
    Ray currentRay = primaryRay;
    
    for (int bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
        HitInfo hit = intersectScene(currentRay);
        
        if (!hit.hit) {
            // 没有击中任何物体，采样背景
            finalColor += throughput * sampleBackground(currentRay.dir);
            break;
        }
        
        // 默认着色 (对于漫反射材质)
        if (hit.material.type == 0) {
            // 漫反射材质
            finalColor += throughput * shade(hit, -currentRay.dir);
            break; // 简化起见，漫反射后停止追踪
        }
        else if (hit.material.type == 1) {
            // 金属反射材质
            vec3 reflectDir = reflect(currentRay.dir, hit.normal);
            currentRay.origin = hit.point + 0.001 * hit.normal; // 避免自相交
            currentRay.dir = reflectDir;
            throughput *= hit.material.albedo;
        }
        else if (hit.material.type == 2) {
            // 玻璃/折射材质
            float eta = hit.material.refractiveIndex;
            bool entering = dot(currentRay.dir, hit.normal) < 0.0;
            vec3 outwardNormal = entering ? hit.normal : -hit.normal;
            
            float ni_over_nt = entering ? (1.0 / eta) : eta;
            vec3 refracted = refract(currentRay.dir, outwardNormal, ni_over_nt);
            
            float cosine = abs(dot(currentRay.dir, outwardNormal));
            float reflectProb = schlick(cosine, eta);
            
            vec3 direction;
            // 使用随机数决定是反射还是折射
            if (random(TexCoords + vec2(time * 0.01)) < reflectProb) {
                direction = reflect(currentRay.dir, outwardNormal);
            } else {
                direction = refracted;
            }
            
            currentRay.origin = hit.point + 0.001 * direction;
            currentRay.dir = direction;
            throughput *= hit.material.albedo;
        }
        
        // 能量衰减检查，防止无限弹射
        float maxComponent = max(max(throughput.r, throughput.g), throughput.b);
        if (maxComponent < 0.01) {
            break;
        }
    }
    
    // 伽马校正
    finalColor = pow(finalColor, vec3(1.0/2.2));
    
    FragColor = vec4(finalColor, 1.0);
}