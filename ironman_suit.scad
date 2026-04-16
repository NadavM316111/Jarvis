
// Iron Man Suit - Scaled for 66 inch (1676mm) human
// Each piece designed for 3D printing assembly

// Human dimensions (66 inches = 1676mm)
human_height = 1676;
chest_circumference = 950;  // ~37 inches
waist_circumference = 810;  // ~32 inches
head_circumference = 570;   // ~22.5 inches
shoulder_width = 450;       // ~18 inches
arm_length = 580;           // ~23 inches
leg_length = 850;           // ~33 inches
foot_length = 270;          // ~10.5 inches

// Armor thickness
armor_thickness = 4;

// ============ HELMET MODULE ============
module helmet() {
    difference() {
        // Outer shell
        scale([1, 1.1, 1.2]) sphere(d=head_circumference/3.14 + 20);
        
        // Inner cavity
        scale([1, 1.1, 1.2]) sphere(d=head_circumference/3.14 + 20 - armor_thickness*2);
        
        // Face opening
        translate([0, 60, -10])
            scale([0.7, 1, 0.5]) sphere(d=120);
        
        // Eye slits
        translate([35, 80, 10]) 
            rotate([0, 0, 10])
            cube([40, 20, 8], center=true);
        translate([-35, 80, 10]) 
            rotate([0, 0, -10])
            cube([40, 20, 8], center=true);
        
        // Bottom opening for head
        translate([0, 0, -100])
            cylinder(d=150, h=100);
    }
    
    // Faceplate details
    translate([0, 85, -20])
        difference() {
            cube([60, 5, 40], center=true);
            cube([50, 10, 30], center=true);
        }
}

// ============ CHEST PLATE MODULE ============
module chest_plate() {
    chest_width = chest_circumference / 3.14;
    chest_depth = chest_width * 0.7;
    chest_height = 350;
    
    difference() {
        // Outer shell
        scale([1, 0.7, 1])
            resize([chest_width + 40, chest_depth + 40, chest_height])
            sphere(d=100);
        
        // Inner cavity
        scale([1, 0.7, 1])
            resize([chest_width + 40 - armor_thickness*2, 
                    chest_depth + 40 - armor_thickness*2, 
                    chest_height - armor_thickness*2])
            sphere(d=100);
        
        // Neck opening
        translate([0, 0, 150])
            cylinder(d=150, h=100);
        
        // Arm holes
        translate([chest_width/2 + 10, 0, 100])
            rotate([0, 90, 0])
            cylinder(d=130, h=50);
        translate([-chest_width/2 - 10, 0, 100])
            rotate([0, -90, 0])
            cylinder(d=130, h=50);
        
        // Bottom opening
        translate([0, 0, -200])
            cylinder(d=250, h=100);
    }
    
    // Arc reactor
    translate([0, chest_depth/2 + 15, 50])
        rotate([90, 0, 0])
        difference() {
            cylinder(d=80, h=10);
            cylinder(d=60, h=15);
        }
    
    // Chest details/ridges
    for(i = [-2:2]) {
        translate([i * 40, chest_depth/2 + 10, 0])
            rotate([80, 0, 0])
            cube([15, 5, 100], center=true);
    }
}

// ============ SHOULDER ARMOR MODULE ============
module shoulder_armor() {
    difference() {
        // Outer dome
        scale([1, 0.8, 0.6])
            sphere(d=180);
        
        // Inner cavity
        scale([1, 0.8, 0.6])
            sphere(d=180 - armor_thickness*2);
        
        // Arm hole
        translate([0, 0, -100])
            cylinder(d=130, h=100);
    }
    
    // Layered plates
    for(i = [0:3]) {
        translate([0, 0, -i*15])
            difference() {
                scale([1 - i*0.05, 0.8 - i*0.05, 0.1])
                    sphere(d=180);
                translate([0, 0, -50])
                    cube([200, 200, 100], center=true);
            }
    }
}

// ============ FOREARM ARMOR MODULE ============
module forearm_armor() {
    arm_length_segment = 250;
    arm_diameter = 100;
    
    difference() {
        // Outer shell
        cylinder(d=arm_diameter + 20, h=arm_length_segment);
        
        // Inner cavity
        translate([0, 0, -1])
            cylinder(d=arm_diameter + 20 - armor_thickness*2, h=arm_length_segment + 2);
        
        // Opening slit for putting on
        translate([0, arm_diameter/2, arm_length_segment/2])
            cube([20, 30, arm_length_segment + 10], center=true);
    }
    
    // Repulsor housing
    translate([0, 0, 0])
        difference() {
            cylinder(d=60, h=15);
            cylinder(d=40, h=20);
        }
    
    // Surface details
    for(i = [0:4]) {
        translate([0, 0, 50 + i*40])
            difference() {
                cylinder(d=arm_diameter + 25, h=10);
                cylinder(d=arm_diameter + 15, h=15);
            }
    }
}

// ============ HAND/GAUNTLET MODULE ============
module gauntlet() {
    // Palm piece
    difference() {
        hull() {
            translate([0, 0, 0]) sphere(d=90);
            translate([0, 0, 60]) sphere(d=70);
        }
        hull() {
            translate([0, 0, 0]) sphere(d=90 - armor_thickness*2);
            translate([0, 0, 60]) sphere(d=70 - armor_thickness*2);
        }
        // Opening
        translate([0, 50, 30])
            cube([100, 50, 100], center=true);
    }
    
    // Repulsor
    translate([0, -30, 10])
        rotate([90, 0, 0])
        difference() {
            cylinder(d=40, h=10);
            cylinder(d=30, h=15);
        }
    
    // Finger guides (simplified)
    for(i = [-1.5:1:1.5]) {
        translate([i*18, 0, 80])
            cylinder(d=18, h=50);
    }
    
    // Thumb
    translate([-45, 0, 40])
        rotate([0, 30, 0])
        cylinder(d=20, h=40);
}

// ============ THIGH ARMOR MODULE ============
module thigh_armor() {
    thigh_length = 400;
    thigh_diameter = 180;
    
    difference() {
        // Outer shell
        resize([thigh_diameter, thigh_diameter * 0.9, thigh_length])
            cylinder(d=100, h=100);
        
        // Inner cavity
        resize([thigh_diameter - armor_thickness*2, 
                thigh_diameter * 0.9 - armor_thickness*2, 
                thigh_length + 2])
            translate([0, 0, -1])
            cylinder(d=100, h=100);
        
        // Opening slit
        translate([thigh_diameter/2, 0, thigh_length/2])
            cube([30, 40, thigh_length + 10], center=true);
    }
    
    // Surface details
    for(i = [0:3]) {
        translate([0, 0, 80 + i*80])
            resize([thigh_diameter + 10, thigh_diameter * 0.9 + 10, 20])
            difference() {
                cylinder(d=100, h=100);
                cylinder(d=90, h=110);
            }
    }
}

// ============ SHIN/BOOT ARMOR MODULE ============
module shin_boot() {
    shin_length = 350;
    shin_diameter = 140;
    
    // Shin guard
    difference() {
        resize([shin_diameter, shin_diameter * 0.85, shin_length])
            cylinder(d=100, h=100);
        
        resize([shin_diameter - armor_thickness*2, 
                shin_diameter * 0.85 - armor_thickness*2, 
                shin_length + 2])
            translate([0, 0, -1])
            cylinder(d=100, h=100);
        
        // Opening
        translate([shin_diameter/2, 0, shin_length/2])
            cube([30, 40, shin_length + 10], center=true);
    }
    
    // Boot base
    translate([0, 20, 0])
        difference() {
            hull() {
                translate([0, 0, 0])
                    resize([120, foot_length, 30])
                    sphere(d=100);
                translate([0, -20, 50])
                    resize([shin_diameter, shin_diameter * 0.85, 20])
                    sphere(d=100);
            }
            hull() {
                translate([0, 0, 5])
                    resize([110, foot_length - 10, 25])
                    sphere(d=100);
                translate([0, -20, 50])
                    resize([shin_diameter - 10, shin_diameter * 0.85 - 10, 20])
                    sphere(d=100);
            }
        }
    
    // Boot thruster
    translate([0, 30, 0])
        rotate([0, 0, 0])
        difference() {
            cylinder(d=50, h=15);
            cylinder(d=35, h=20);
        }
}

// ============ BACK PLATE MODULE ============
module back_plate() {
    back_width = chest_circumference / 3.14;
    back_depth = back_width * 0.5;
    back_height = 380;
    
    difference() {
        // Outer shell
        scale([1, 0.5, 1])
            resize([back_width + 30, back_depth + 30, back_height])
            sphere(d=100);
        
        // Inner cavity
        scale([1, 0.5, 1])
            resize([back_width + 30 - armor_thickness*2, 
                    back_depth + 30 - armor_thickness*2, 
                    back_height - armor_thickness*2])
            sphere(d=100);
        
        // Front opening
        translate([0, 50, 0])
            cube([back_width + 50, 100, back_height + 50], center=true);
    }
    
    // Spine detail
    for(i = [-4:4]) {
        translate([0, -back_depth/2 - 10, i * 35])
            cube([30, 15, 25], center=true);
    }
    
    // Thruster housings
    translate([80, -back_depth/2, 50])
        rotate([90, 0, 0])
        difference() {
            cylinder(d=60, h=20);
            cylinder(d=45, h=25);
        }
    translate([-80, -back_depth/2, 50])
        rotate([90, 0, 0])
        difference() {
            cylinder(d=60, h=20);
            cylinder(d=45, h=25);
        }
}

// ============ RENDER INDIVIDUAL PIECES ============
// Uncomment the piece you want to render/export

// Full assembly preview (not for printing - just visualization)
// Scale down for preview
scale_factor = 0.1;  // 10% scale for preview

translate([0, 0, 1500 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) helmet();
translate([0, 0, 1100 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) chest_plate();
translate([250 * scale_factor, 0, 1200 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) shoulder_armor();
translate([-250 * scale_factor, 0, 1200 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) mirror([1,0,0]) shoulder_armor();
translate([350 * scale_factor, 0, 900 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) forearm_armor();
translate([-350 * scale_factor, 0, 900 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) forearm_armor();
translate([400 * scale_factor, 0, 600 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) gauntlet();
translate([-400 * scale_factor, 0, 600 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) mirror([1,0,0]) gauntlet();
translate([0, 0, 750 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) back_plate();
translate([120 * scale_factor, 0, 500 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) thigh_armor();
translate([-120 * scale_factor, 0, 500 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) thigh_armor();
translate([120 * scale_factor, 0, 100 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) shin_boot();
translate([-120 * scale_factor, 0, 100 * scale_factor]) scale([scale_factor, scale_factor, scale_factor]) shin_boot();

// FOR ACTUAL PRINTING, export each piece separately:
// helmet();
// chest_plate();
// shoulder_armor();
// forearm_armor();
// gauntlet();
// thigh_armor();
// shin_boot();
// back_plate();
