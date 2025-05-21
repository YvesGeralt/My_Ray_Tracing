#version 330 core
out vec4 FragColor;

in vec2 TexCoords;

uniform vec3 cameraPos;
uniform vec3 cameraFront;
uniform vec3 cameraUp;
uniform float time;

// ���ʶ���
struct Material {
    int type;            // 0: ������, 1: ����(����), 2: ����(����)
    vec3 albedo;         // ������/��ɫ
    float roughness;     // �ֲڶ�
    float refractiveIndex; // ������ (��������ʹ��)
};

// Stanford Bunnyģ������
const int MAX_TRIANGLES = 30000;
uniform int numTriangles;
uniform vec3 triVertices[MAX_TRIANGLES];
uniform Material bunnyMaterial;

// ���嶨��
struct Sphere {
    vec3 center;
    float radius;
    Material material;
};

const int MAX_SPHERES = 10;
uniform int numSpheres;
uniform Sphere spheres[MAX_SPHERES];

// ��Դ
uniform vec3 lightPos = vec3(10.0, 10.0, 10.0);
uniform vec3 lightColor = vec3(1.0, 1.0, 1.0);
uniform float ambientStrength = 0.3;

// ������󷴵�����
const int MAX_BOUNCES = 3;

// ���߽ṹ
struct Ray {
    vec3 origin;
    vec3 dir;
};

// �ཻ����Ϣ
struct HitInfo {
    bool hit;
    float t;
    vec3 point;
    vec3 normal;
    Material material;
};

// ��������� (���ڹ�ϣ)
float random(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

// ����-�����ཻ����
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

// ������-�����ཻ����
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

// ����-�����ཻ���� (��������Ľ���)
HitInfo intersectScene(Ray ray) {
    HitInfo result;
    result.hit = false;
    result.t = 1e20;
    
    // ���������������ཻ
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
    
    // �����Stanford Bunny�����������ε��ཻ
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

// ���亯��
vec3 reflect(vec3 incident, vec3 normal) {
    return incident - 2.0 * dot(incident, normal) * normal;
}

// ���亯�� (ʹ��˹��������)
vec3 refract(vec3 incident, vec3 normal, float eta) {
    float cosTheta = min(dot(-incident, normal), 1.0);
    vec3 r_perp = eta * (incident + cosTheta * normal);
    vec3 r_para = -sqrt(1.0 - dot(r_perp, r_perp)) * normal;
    return r_perp + r_para;
}

// ���������� (Schlick����)
float schlick(float cosine, float refIdx) {
    float r0 = (1.0 - refIdx) / (1.0 + refIdx);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * pow((1.0 - cosine), 5.0);
}

// ������������
vec3 sampleBackground(vec3 direction) {
    // �򵥵���ս���
    float t = 0.5 * (direction.y + 1.0);
    return mix(vec3(1.0), vec3(0.5, 0.7, 1.0), t);
}

// �����Ӱ
bool inShadow(vec3 point, vec3 lightDir) {
    Ray shadowRay;
    shadowRay.origin = point + 0.001 * lightDir; // �������ཻ
    shadowRay.dir = lightDir;
    
    HitInfo shadowHit = intersectScene(shadowRay);
    return shadowHit.hit;
}

// ��Ҫ��ɫ����
vec3 shade(HitInfo hit, vec3 viewDir) {
    vec3 lightDir = normalize(lightPos - hit.point);
    float diff = max(dot(hit.normal, lightDir), 0.0);
    vec3 diffuse = diff * hit.material.albedo * lightColor;
    vec3 ambient = ambientStrength * hit.material.albedo;
    
    // ����Ƿ�����Ӱ��
    if (inShadow(hit.point, lightDir)) {
        return ambient;
    }
    
    return ambient + diffuse;
}

void main() {
    // ������ͼ���� (���������)
    vec3 right = normalize(cross(cameraFront, cameraUp));
    vec3 up = normalize(cross(right, cameraFront));
    mat4 view = mat4(
        vec4(right, 0.0),
        vec4(up, 0.0),
        vec4(-cameraFront, 0.0),
        vec4(0.0, 0.0, 0.0, 1.0)
    );
    
    // ����͸��ͶӰ����
    float aspect = 16.0/9.0; // ����ʹ��uniform����
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
    
    // ������߷���
    vec2 ndc = TexCoords * 2.0 - 1.0;
    vec4 clip = vec4(ndc, -1.0, 1.0);
    vec4 viewSpace = inverse(projection) * clip;
    viewSpace = vec4(viewSpace.xyz / viewSpace.w, 0.0);
    vec3 worldDir = normalize((inverse(view) * viewSpace).xyz);
    
    // ������
    Ray primaryRay;
    primaryRay.origin = cameraPos;
    primaryRay.dir = worldDir;
    
    // ʵ�ֵ�������׷�� (����ݹ�)
    vec3 finalColor = vec3(0.0);
    vec3 throughput = vec3(1.0);
    Ray currentRay = primaryRay;
    
    for (int bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
        HitInfo hit = intersectScene(currentRay);
        
        if (!hit.hit) {
            // û�л����κ����壬��������
            finalColor += throughput * sampleBackground(currentRay.dir);
            break;
        }
        
        // Ĭ����ɫ (�������������)
        if (hit.material.type == 0) {
            // ���������
            finalColor += throughput * shade(hit, -currentRay.dir);
            break; // ��������������ֹͣ׷��
        }
        else if (hit.material.type == 1) {
            // �����������
            vec3 reflectDir = reflect(currentRay.dir, hit.normal);
            currentRay.origin = hit.point + 0.001 * hit.normal; // �������ཻ
            currentRay.dir = reflectDir;
            throughput *= hit.material.albedo;
        }
        else if (hit.material.type == 2) {
            // ����/�������
            float eta = hit.material.refractiveIndex;
            bool entering = dot(currentRay.dir, hit.normal) < 0.0;
            vec3 outwardNormal = entering ? hit.normal : -hit.normal;
            
            float ni_over_nt = entering ? (1.0 / eta) : eta;
            vec3 refracted = refract(currentRay.dir, outwardNormal, ni_over_nt);
            
            float cosine = abs(dot(currentRay.dir, outwardNormal));
            float reflectProb = schlick(cosine, eta);
            
            vec3 direction;
            // ʹ������������Ƿ��仹������
            if (random(TexCoords + vec2(time * 0.01)) < reflectProb) {
                direction = reflect(currentRay.dir, outwardNormal);
            } else {
                direction = refracted;
            }
            
            currentRay.origin = hit.point + 0.001 * direction;
            currentRay.dir = direction;
            throughput *= hit.material.albedo;
        }
        
        // ����˥����飬��ֹ���޵���
        float maxComponent = max(max(throughput.r, throughput.g), throughput.b);
        if (maxComponent < 0.01) {
            break;
        }
    }
    
    // ٤��У��
    finalColor = pow(finalColor, vec3(1.0/2.2));
    
    FragColor = vec4(finalColor, 1.0);
}