#include <glad/glad.h>
#include <glfw/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <iostream>
#include <vector>
#include <string>
#include <chrono>

#include "shader.h"
#include "camera.h"

#define TINYOBJLOADER_IMPLEMENTATION
#include <tinyobjloader/tiny_obj_loader.h>

// ���ڳߴ�
const unsigned int SCR_WIDTH = 1280;
const unsigned int SCR_HEIGHT = 720;

// ���
Camera camera(glm::vec3(0.0f, 0.5f, 5.0f));
float lastX = SCR_WIDTH / 2.0f;
float lastY = SCR_HEIGHT / 2.0f;
bool firstMouse = true;

float deltaTime = 0.0f;
float lastFrame = 0.0f;

// ����ṹ��
struct Sphere {
    glm::vec3 center;
    float radius;
    int materialType;         // 0: ������, 1: ����(����), 2: ����(����)
    glm::vec3 albedo;         // ��ɫ
    float roughness;          // �ֲڶ�
    float refractiveIndex;    // ������ (���ڲ�������)
};

// �����������봦��
void processInput(GLFWwindow* window) {
    if (glfwGetKey(window, GLFW_KEY_ESCAPE) == GLFW_PRESS)
        glfwSetWindowShouldClose(window, true);
    if (glfwGetKey(window, GLFW_KEY_W) == GLFW_PRESS)
        camera.ProcessKeyboard(FORWARD, deltaTime);
    if (glfwGetKey(window, GLFW_KEY_S) == GLFW_PRESS)
        camera.ProcessKeyboard(BACKWARD, deltaTime);
    if (glfwGetKey(window, GLFW_KEY_A) == GLFW_PRESS)
        camera.ProcessKeyboard(LEFT, deltaTime);
    if (glfwGetKey(window, GLFW_KEY_D) == GLFW_PRESS)
        camera.ProcessKeyboard(RIGHT, deltaTime);
}

void mouse_callback(GLFWwindow* window, double xpos, double ypos) {
    if (firstMouse) {
        lastX = (float)xpos;
        lastY = (float)ypos;
        firstMouse = false;
    }
    float xoffset = (float)xpos - lastX;
    float yoffset = lastY - (float)ypos;
    lastX = (float)xpos;
    lastY = (float)ypos;
    camera.ProcessMouseMovement(xoffset, yoffset);
}

void scroll_callback(GLFWwindow* window, double xoffset, double yoffset) {
    camera.ProcessMouseScroll((float)yoffset);
}

// �������ڴ�С�Ļص�����
void framebuffer_size_callback(GLFWwindow* window, int width, int height) {
    glViewport(0, 0, width, height);
}

int main() {
    // ��ʼ�� GLFW
    glfwInit();
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);

    // ��������
    GLFWwindow* window = glfwCreateWindow(SCR_WIDTH, SCR_HEIGHT, "Ray Tracing", nullptr, nullptr);
    if (!window) {
        std::cerr << "Failed to create GLFW window\n";
        glfwTerminate();
        return -1;
    }
    glfwMakeContextCurrent(window);

    // ���ûص�����
    glfwSetFramebufferSizeCallback(window, framebuffer_size_callback);
    glfwSetCursorPosCallback(window, mouse_callback);
    glfwSetScrollCallback(window, scroll_callback);
    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

    // ��ʼ�� GLAD
    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) {
        std::cerr << "Failed to initialize GLAD\n";
        return -1;
    }

    // �����ӿ�
    glViewport(0, 0, SCR_WIDTH, SCR_HEIGHT);
    glEnable(GL_DEPTH_TEST);

    // ���� Shader
    Shader rayShader("shaders/raytrace.vert", "shaders/raytrace.frag");

    // ========== ���� Stanford Bunny ģ�� ========== 
    std::vector<glm::vec3> triangleVertices;

    tinyobj::attrib_t attrib;
    std::vector<tinyobj::shape_t> shapes;
    std::vector<tinyobj::material_t> materials;
    std::string warn, err;

    std::cout << "Loading Stanford Bunny model...\n";
    bool ret = tinyobj::LoadObj(&attrib, &shapes, &materials, &warn, &err, "models/bunny.obj");
    if (!ret) {
        std::cerr << "Failed to load Bunny OBJ: " << err << std::endl;
        return -1;
    }

    // �ռ����������ζ���
    for (const auto& shape : shapes) {
        for (size_t i = 0; i < shape.mesh.indices.size(); i += 3) {
            for (int j = 0; j < 3; ++j) {
                tinyobj::index_t idx = shape.mesh.indices[i + j];
                glm::vec3 vertex = {
                    attrib.vertices[3 * idx.vertex_index + 0],
                    attrib.vertices[3 * idx.vertex_index + 1],
                    attrib.vertices[3 * idx.vertex_index + 2]
                };
                triangleVertices.push_back(vertex);
            }
        }
    }

    // ���в�����ģ��
    glm::vec3 min_bounds(1e10f), max_bounds(-1e10f);
    for (const auto& v : triangleVertices) {
        min_bounds = glm::min(min_bounds, v);
        max_bounds = glm::max(max_bounds, v);
    }

    glm::vec3 center = (min_bounds + max_bounds) * 0.5f;
    float scale = 2.0f / glm::length(max_bounds - min_bounds);

    for (auto& v : triangleVertices) {
        v = (v - center) * scale;
        // ��bunny����y=0ƽ����
        v.y += 0.5f;
    }

    std::cout << "Loaded " << triangleVertices.size() / 3 << " triangles." << std::endl;

    // ========== ������������ ==========
    std::vector<Sphere> spheres = {
        // �������ɫ���� (���)
        {
            glm::vec3(-1.0f, 0.5f, 0.0f),  // ����
            0.5f,                          // �뾶
            0,                             // ��������: ������
            glm::vec3(0.9f, 0.2f, 0.2f),   // ��ɫ: ��ɫ
            0.7f,                          // �ֲڶ�
            0.0f                           // ������ (��������������)
        },
        // �������� (�Ҳ�)
        {
            glm::vec3(1.0f, 0.5f, 0.0f),   // ����
            0.5f,                          // �뾶
            2,                             // ��������: ����
            glm::vec3(0.95f, 0.95f, 0.95f),// ��ɫ: �ӽ���ɫ
            0.1f,                          // �ֲڶ�
            1.5f                           // ������: ����
        }
    };

    // ========== ����ȫ�� Quad ==========
    float quadVertices[] = {
        // λ��      // ��������
        -1.0f, -1.0f, 0.0f, 0.0f,
         1.0f, -1.0f, 1.0f, 0.0f,
        -1.0f,  1.0f, 0.0f, 1.0f,
         1.0f,  1.0f, 1.0f, 1.0f
    };

    unsigned int quadVAO, quadVBO;
    glGenVertexArrays(1, &quadVAO);
    glGenBuffers(1, &quadVBO);
    glBindVertexArray(quadVAO);
    glBindBuffer(GL_ARRAY_BUFFER, quadVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quadVertices), quadVertices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void*)(2 * sizeof(float)));
    glEnableVertexAttribArray(1);

    // ========== ��Ⱦѭ�� ==========
    while (!glfwWindowShouldClose(window)) {
        // ����֡ʱ��
        float currentFrame = (float)glfwGetTime();
        deltaTime = currentFrame - lastFrame;
        lastFrame = currentFrame;

        // ��������
        processInput(window);

        // ����
        glClearColor(0.05f, 0.05f, 0.1f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        // ʹ�� Shader
        rayShader.use();

        // ������ͼ��ͶӰ����
        glm::mat4 view = camera.GetViewMatrix();
        glm::mat4 projection = glm::perspective(glm::radians(camera.Zoom), (float)SCR_WIDTH / (float)SCR_HEIGHT, 0.1f, 100.0f);

        // ������������� shader
        rayShader.setVec3("cameraPos", camera.Position);
        rayShader.setVec3("cameraFront", camera.Front);
        rayShader.setVec3("cameraUp", camera.Up);
        rayShader.setMat4("view", view);
        rayShader.setMat4("projection", projection);
        rayShader.setFloat("time", currentFrame); // �������������

        // ���ݵƹ����
        rayShader.setVec3("lightPos", glm::vec3(5.0f, 5.0f, 5.0f));
        rayShader.setVec3("lightColor", glm::vec3(1.0f, 1.0f, 1.0f));
        rayShader.setFloat("ambientStrength", 0.3f);

        // ����Stanford Bunnyģ�Ͷ���
        int maxTriangles = std::min((int)triangleVertices.size(), 30000);
        rayShader.setInt("numTriangles", maxTriangles / 3);

        for (int i = 0; i < maxTriangles; ++i) {
            std::string name = "triVertices[" + std::to_string(i) + "]";
            rayShader.setVec3(name, triangleVertices[i]);
        }

        // ����Bunny����
        rayShader.setInt("bunnyMaterial.type", 0); // ������
        rayShader.setVec3("bunnyMaterial.albedo", glm::vec3(0.75f, 0.75f, 0.75f)); // ��ɫ
        rayShader.setFloat("bunnyMaterial.roughness", 0.6f);
        rayShader.setFloat("bunnyMaterial.refractiveIndex", 0.0f);

        // ������������
        rayShader.setInt("numSpheres", (int)spheres.size());
        for (size_t i = 0; i < spheres.size(); i++) {
            std::string baseName = "spheres[" + std::to_string(i) + "]";
            rayShader.setVec3(baseName + ".center", spheres[i].center);
            rayShader.setFloat(baseName + ".radius", spheres[i].radius);
            rayShader.setInt(baseName + ".material.type", spheres[i].materialType);
            rayShader.setVec3(baseName + ".material.albedo", spheres[i].albedo);
            rayShader.setFloat(baseName + ".material.roughness", spheres[i].roughness);
            rayShader.setFloat(baseName + ".material.refractiveIndex", spheres[i].refractiveIndex);
        }

        // ����ȫ���ı���
        glBindVertexArray(quadVAO);
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

        // �������岢��ѯ�¼�
        glfwSwapBuffers(window);
        glfwPollEvents();
    }

    // ������Դ
    glDeleteVertexArrays(1, &quadVAO);
    glDeleteBuffers(1, &quadVBO);

    glfwTerminate();
    return 0;
}