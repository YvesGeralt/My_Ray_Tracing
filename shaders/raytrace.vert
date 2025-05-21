#version 330 core

layout (location = 0) in vec2 aPos;   // λ��
layout (location = 1) in vec2 aTex;   // ��������

out vec2 TexCoords;

void main()
{
    TexCoords = aTex;
    gl_Position = vec4(aPos.xy, 0.0, 1.0); // Fullscreen Quad ����λ�� [-1, 1]
}
