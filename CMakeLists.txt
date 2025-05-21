cmake_minimum_required(VERSION 3.10)
project(Ray_Tracing)

set(CMAKE_CXX_STANDARD 17)

# 设置输出目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# 设置头文件路径
include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/external/include
)

# 设置库文件路径
link_directories(
    ${CMAKE_SOURCE_DIR}/external/lib
)

# 源代码文件
set(SOURCES
    src/main.cpp
    src/shader.cpp
    src/glad.c
)

# 头文件
set(HEADERS
    include/shader.h
    include/camera.h
)

# 生成可执行文件
add_executable(Ray_Tracing ${SOURCES} ${HEADERS})

# 链接预编译好的库
target_link_libraries(Ray_Tracing
    glfw3.lib
    opengl32.lib   # Windows 自带的 OpenGL 库
)

# 复制着色器和模型文件到输出目录
add_custom_command(TARGET Ray_Tracing POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/shaders"
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/models"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/shaders" "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/shaders"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/models"
)

# 这个目标依赖于需要复制的文件
add_custom_target(copy_resources ALL
    COMMAND ${CMAKE_COMMAND} -E echo "Copied resources to output directory"
    DEPENDS Ray_Tracing
)