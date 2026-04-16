
// iPhone 15 Phone Stand
// Designed for iPhone 15 (147.6 x 71.6 x 7.8mm) with case tolerance

// Phone dimensions with case tolerance
phone_width = 75;      // 71.6mm + case tolerance
phone_thickness = 12;  // 7.8mm + thick case tolerance
phone_height = 150;    // 147.6mm

// Stand parameters
stand_width = 85;
stand_depth = 80;
stand_height = 100;
stand_thickness = 5;
viewing_angle = 70;    // Angle from horizontal

// Slot parameters
slot_width = phone_width + 2;
slot_depth = phone_thickness + 2;
slot_height = 25;

// Cable hole
cable_hole_diameter = 15;

module phone_stand() {
    difference() {
        union() {
            // Base plate
            cube([stand_width, stand_depth, stand_thickness]);
            
            // Back support (angled)
            translate([0, stand_depth - stand_thickness, 0])
            rotate([90 - viewing_angle, 0, 0])
            cube([stand_width, stand_height, stand_thickness]);
            
            // Front lip to hold phone
            translate([(stand_width - slot_width)/2, 15, stand_thickness])
            difference() {
                cube([slot_width, slot_depth + 5, slot_height]);
                translate([1, 5, 5])
                cube([slot_width - 2, slot_depth, slot_height]);
            }
            
            // Side supports for stability
            translate([0, 0, 0])
            linear_extrude(height = stand_thickness)
            polygon([[0, 0], [stand_thickness, 0], [stand_thickness, stand_depth], [0, stand_depth]]);
            
            translate([stand_width - stand_thickness, 0, 0])
            linear_extrude(height = stand_thickness)
            polygon([[0, 0], [stand_thickness, 0], [stand_thickness, stand_depth], [0, stand_depth]]);
        }
        
        // Cable management hole in base
        translate([stand_width/2, 25, -1])
        cylinder(h = stand_thickness + 2, d = cable_hole_diameter, $fn = 32);
        
        // Phone slot cutout in front lip
        translate([(stand_width - slot_width)/2 + 1, 20, stand_thickness + 5])
        cube([slot_width - 2, slot_depth, slot_height + 1]);
    }
}

// Render the stand
phone_stand();
