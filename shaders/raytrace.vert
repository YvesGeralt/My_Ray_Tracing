#version 330 core

layout (location = 0) in vec2 aPos;   // 位置
layout (location = 1) in vec2 aTex;   // 纹理坐标

out vec2 TexCoords;

void main()
{
    TexCoords = aTex;
    gl_Position = vec4(aPos.xy, 0.0, 1.0); // Fullscreen Quad 顶点位置 [-1, 1]
}
