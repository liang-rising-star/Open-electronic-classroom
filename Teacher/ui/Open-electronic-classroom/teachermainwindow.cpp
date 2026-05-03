#include "teachermainwindow.h"
#include "ui_teachermainwindow.h"

TeacherMainWindow::TeacherMainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::TeacherMainWindow)
{
    ui->setupUi(this);
}

TeacherMainWindow::~TeacherMainWindow()
{
    delete ui;
}
