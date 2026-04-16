"""
JARVIS App Analyzer
Analyzes running applications and their resource usage on Windows.
Author: JARVIS for Nadav
Date: April 14, 2026
"""

import subprocess
import json
from collections import defaultdict


def get_running_apps():
    """
    Retrieves all running processes with their CPU and memory usage.
    Returns a list of dictionaries containing process information.
    """
    
    # PowerShell command to get detailed process information
    ps_command = """
    Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | 
    Select-Object ProcessName, Id, 
        @{Name='CPU_Seconds';Expression={$_.CPU}},
        @{Name='Memory_MB';Expression={[math]::Round($_.WorkingSet64/1MB, 2)}},
        @{Name='WindowTitle';Expression={$_.MainWindowTitle}} |
    ConvertTo-Json
    """
    
    try:
        result = subprocess.run(
            ["powershell", "-Command", ps_command],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0 and result.stdout.strip():
            processes = json.loads(result.stdout)
            # Ensure it's always a list
            if isinstance(processes, dict):
                processes = [processes]
            return processes
        return []
        
    except Exception as e:
        print(f"Error retrieving processes: {e}")
        return []


def get_all_processes():
    """
    Gets ALL running processes (including background) sorted by memory usage.
    """
    
    ps_command = """
    Get-Process | 
    Select-Object ProcessName,
        @{Name='Memory_MB';Expression={[math]::Round($_.WorkingSet64/1MB, 2)}},
        @{Name='CPU_Seconds';Expression={if($_.CPU){[math]::Round($_.CPU, 2)}else{0}}} |
    Sort-Object Memory_MB -Descending |
    Select-Object -First 20 |
    ConvertTo-Json
    """
    
    try:
        result = subprocess.run(
            ["powershell", "-Command", ps_command],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
        return []
        
    except Exception as e:
        print(f"Error: {e}")
        return []


def format_output(apps, top_processes):
    """
    Formats the output in a readable manner.
    """
    
    print("=" * 60)
    print("🖥️  JARVIS APP ANALYZER")
    print("=" * 60)
    
    # Active Windows
    print("\n📱 ACTIVE WINDOWS (Apps with visible windows):")
    print("-" * 60)
    
    if apps:
        # Sort by memory usage
        apps_sorted = sorted(apps, key=lambda x: x.get('Memory_MB', 0), reverse=True)
        
        for app in apps_sorted:
            name = app.get('ProcessName', 'Unknown')
            memory = app.get('Memory_MB', 0)
            title = app.get('WindowTitle', '')[:40]  # Truncate long titles
            cpu = app.get('CPU_Seconds', 0) or 0
            
            print(f"  • {name:<20} | {memory:>8.1f} MB | CPU: {cpu:>8.1f}s")
            if title:
                print(f"    └─ {title}")
    else:
        print("  No active windows detected.")
    
    # Top Processes by Memory
    print("\n💾 TOP PROCESSES BY MEMORY:")
    print("-" * 60)
    
    if top_processes:
        for proc in top_processes[:10]:
            name = proc.get('ProcessName', 'Unknown')
            memory = proc.get('Memory_MB', 0)
            cpu = proc.get('CPU_Seconds', 0)
            
            # Memory bar visualization
            bar_length = min(int(memory / 50), 20)
            bar = "█" * bar_length
            
            print(f"  {name:<25} {memory:>8.1f} MB  {bar}")
    
    # Summary
    print("\n📊 SUMMARY:")
    print("-" * 60)
    total_memory = sum(p.get('Memory_MB', 0) for p in top_processes) if top_processes else 0
    app_count = len(apps) if apps else 0
    
    print(f"  Active Windows: {app_count}")
    print(f"  Top 20 Processes Memory: {total_memory:,.1f} MB")
    print("=" * 60)


def main():
    """
    Main function to run the app analyzer.
    """
    print("\n🔍 Scanning running applications...\n")
    
    # Get apps with visible windows
    active_apps = get_running_apps()
    
    # Get top processes by memory
    top_processes = get_all_processes()
    
    # Display formatted output
    format_output(active_apps, top_processes)
    
    return {
        "active_apps": active_apps,
        "top_processes": top_processes
    }


if __name__ == "__main__":
    main()
